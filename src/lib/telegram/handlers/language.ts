import { CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, MessageContext } from '../types'

export default {
  message: [
    // step = 0
    async (ctx: MessageContext) => {
      ctx.session.currentCommand = { id: 'language', step: 0 }
      const keyboardButtons = [
        {
          text: 'Español',
          callback_data: 'es',
        },
        {
          text: 'English',
          callback_data: 'en',
        },
      ]
      await ctx.reply(`Choose your language`, {
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },
  ],
  callbackQuery: [
    // step = 0
    async (ctx: CallbackQueryContext) => {
      const lang = (ctx.callbackQuery as CallbackQuery.DataQuery).data
      ctx.session.language = lang
      ctx.session.currentCommand = null
      await ctx.answerCbQuery(`Your new language is: ${lang}`)
    },
  ],
}
