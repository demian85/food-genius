import { CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, MessageContext } from '../types'
import { callbackError, cancelCommand } from './util'
import { proteins } from '../data'
import { buildKeyboardButtons } from './eat/util'

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
          text: 'Proteínas',
          callback_data: 'proteins',
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

      if (callbackValue === 'proteins') {
        await updateProteinsKeyboard(ctx)
      }

      await ctx.answerCbQuery()
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
        case 'proteins':
          await ctx.answerCbQuery()
          if (callbackValue === '__ok__') {
            ctx.editMessageText(
              `Tus proteínas son: ${ctx.session.config.proteins.join(', ')}`,
              { reply_markup: { inline_keyboard: [] } }
            )
          } else {
            ctx.session.config.proteins = proteins.reduce((prev, curr) => {
              const incl = ctx.session.config.proteins.includes(curr)
              if (curr === callbackValue) {
                if (!incl) {
                  prev.push(curr)
                }
              } else if (incl) {
                prev.push(curr)
              }
              return prev
            }, [] as string[])

            await updateProteinsKeyboard(ctx)
          }
          break
        default:
          return callbackError(ctx)
      }
    },
  ],
}

async function updateProteinsKeyboard(ctx: CallbackQueryContext) {
  await ctx.editMessageReplyMarkup({
    inline_keyboard: buildKeyboardButtons([
      ...proteins.map((v) => {
        if (ctx.session.config.proteins.includes(v)) {
          return { text: `✔️ ${v}`, callback_data: v }
        }
        return { text: `❌ ${v}`, callback_data: v }
      }),
      { text: '👍 Listo!', callback_data: '__ok__' },
    ]),
  })
}
