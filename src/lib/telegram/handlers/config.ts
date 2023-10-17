import { CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, MessageContext } from '../types'
import { callbackError, cancelCommand } from './util'

export default {
  message: [
    // step = 0
    async (ctx: MessageContext) => {
      ctx.session.currentCommand = { id: 'config', step: 0 }
      const keyboardButtons = [
        {
          text: 'Idioma',
          callback_data: 'language',
        },
        {
          text: 'Restricciones dietarias',
          callback_data: 'dietary_restrictions',
        },
      ]
      await ctx.reply(`Elige una opción`, {
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },
  ],
  callbackQuery: [
    // step = 0
    async (ctx: CallbackQueryContext) => {
      const callbackValue = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      ctx.session.currentCommand!.step = 1
      ctx.session.currentCommand!.subcommand = callbackValue

      if (callbackValue === 'language') {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: 'Español', callback_data: 'es' },
              { text: 'English', callback_data: 'en' },
            ],
          ],
        })
      }

      if (callbackValue === 'dietary_restrictions') {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: 'Regular', callback_data: 'regular' },
              { text: 'Vegano', callback_data: 'vegan' },
              { text: 'Vegetariano', callback_data: 'vegetarian' },
            ],
          ],
        })
      }

      await ctx.answerCbQuery(``)
    },

    // step = 1
    async (ctx: CallbackQueryContext) => {
      const callbackValue = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      switch (ctx.session.currentCommand?.subcommand) {
        case 'language':
          ctx.session.config.language = callbackValue
          await ctx.answerCbQuery('')
          await ctx.editMessageText(
            callbackValue === 'en'
              ? `Your new language is English`
              : `Tu nuevo idioma es Español`,
            { reply_markup: { inline_keyboard: [] } }
          )
          return cancelCommand(ctx)
        case 'dietary_restrictions':
          ctx.session.config.dietaryRestrictions = callbackValue
          await ctx.answerCbQuery('')
          await ctx.editMessageText(
            `Se ha establecido nueva restricción dietaria`,
            { reply_markup: { inline_keyboard: [] } }
          )
          return cancelCommand(ctx)
        default:
          return callbackError(ctx)
      }
    },
  ],
}
