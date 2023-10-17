import {
  CallbackQuery,
  InlineKeyboardButton,
} from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, EatCommand, MessageContext } from '../../types'
import { capitalize } from 'lodash'
import {
  buildKeyboardButtons,
  handleRecipeDescription,
  handleRecipeOptions,
  proteinsByDietaryRestrictions,
  searchLocalRecipes,
  searchRecipesUsingOpenAI,
} from './util'
import { cancelCommand } from '../util'

export default {
  message: [
    // step = 0
    async (ctx: MessageContext) => {
      ctx.session.currentCommand = { id: 'eat', step: 0 }
      const keyboardOptions: Record<string, InlineKeyboardButton[]> = {
        es: [
          {
            text: 'Desayuno',
            callback_data: 'breakfast',
          },
          {
            text: 'Almuerzo',
            callback_data: 'lunch',
          },
          {
            text: 'Merienda',
            callback_data: 'supper',
          },
          {
            text: 'Cena',
            callback_data: 'dinner',
          },
        ],
        en: [
          {
            text: 'Breakfast',
            callback_data: 'breakfast',
          },
          {
            text: 'Lunch',
            callback_data: 'lunch',
          },
          {
            text: 'Supper',
            callback_data: 'supper',
          },
          {
            text: 'Dinner',
            callback_data: 'dinner',
          },
        ],
      }
      const keyboardButtons = keyboardOptions[ctx.session.config.language]
      await ctx.reply(`Elige la categoría`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },
  ],
  callbackQuery: [
    // step = 0 - category selected
    async (ctx: CallbackQueryContext) => {
      const category = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.category = category

      await ctx.answerCbQuery('')

      if (['breakfast', 'supper'].includes(category)) {
        currentCommand.step = 2
        currentCommand.recipes = await searchLocalRecipes(
          currentCommand.category,
          null
        )

        await handleRecipeOptions(ctx, false)
      } else {
        currentCommand.step = 1
        const proteins =
          proteinsByDietaryRestrictions[ctx.session.config.dietaryRestrictions]

        if (!proteins.length) {
          await ctx.editMessageText('No se han encontrado recetas')
          return
        }

        const keyboardButtons = proteins.map((v) => ({
          text: capitalize(v),
          callback_data: v,
        }))

        await ctx.editMessageText('Elige la proteína', {
          reply_markup: {
            inline_keyboard: buildKeyboardButtons(keyboardButtons),
          },
        })
      }
    },

    // step = 1 - protein selected
    async (ctx: CallbackQueryContext) => {
      const protein = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 2
      currentCommand.protein = protein

      await ctx.answerCbQuery('')

      currentCommand.recipes = await searchLocalRecipes(
        currentCommand.category,
        protein
      )

      await handleRecipeOptions(ctx, false)
    },

    // step = 2 - recipe selected
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
            currentCommand.protein,
            ctx.session.config.dietaryRestrictions,
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
