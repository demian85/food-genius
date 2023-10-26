import { CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, EatCommand, MessageContext } from '../../types'
import {
  buildKeyboardButtons,
  getCategories,
  handleRecipeDescription,
  handleRecipeOptions,
  searchCollations,
  searchLocalRecipes,
  searchRecipesUsingOpenAI,
} from './util'
import { cancelCommand } from '../util'

export default {
  message: [
    // step = 0
    async (ctx: MessageContext) => {
      ctx.session.currentCommand = { id: 'eat', step: 0 }
      const categories = await getCategories()
      const keyboardButtons = categories.map((v) => ({
        text: v.name,
        callback_data: String(v.id),
      }))
      await ctx.reply(`Elige la categoría`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buildKeyboardButtons(keyboardButtons),
        },
      })
    },
  ],
  callbackQuery: [
    // step = 0 - category selected
    async (ctx: CallbackQueryContext) => {
      const categoryId = +(ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 1
      currentCommand.categoryId = categoryId

      await ctx.answerCbQuery()

      const recipes =
        categoryId === 1
          ? await searchLocalRecipes(
              currentCommand.categoryId,
              2,
              ctx.session.config.proteins
            )
          : await searchCollations()

      if (!recipes.length) {
        await ctx.editMessageText('No se han encontrado recetas')
        return
      }

      currentCommand.recipes = recipes

      await handleRecipeOptions(ctx, false)
    },

    // step = 1 - recipe selected
    async (ctx: CallbackQueryContext) => {
      const callbackData = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand

      await ctx.answerCbQuery('')

      if (callbackData === 'ok') {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] })
        return cancelCommand(ctx)
      }

      if (callbackData === 'other') {
        ctx.sendChatAction('typing')
        try {
          currentCommand.recipes = await searchRecipesUsingOpenAI(
            ctx.session.config.proteins,
            3,
            currentCommand.recipes.map((v) => v.title)
          )

          await handleRecipeOptions(ctx)
        } catch (err) {
          await ctx.editMessageText(
            `Ha ocurrido un error en la búsqueda. Intenta de nuevo.`
          )
        }
        return
      }

      const currentRecipe = currentCommand.recipes[+callbackData]
      await handleRecipeDescription(ctx, currentRecipe)
    },
  ],
}
