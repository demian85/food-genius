import {
  CallbackQuery,
  InlineKeyboardButton,
} from 'telegraf/typings/core/types/typegram'
import { CallbackQueryContext, MessageContext } from '../types'
import { db } from '@lib/db'
import { capitalize } from 'lodash'

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
      const keyboardButtons = keyboardOptions[ctx.session.language]
      await ctx.reply(`Choose your category`, {
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },
  ],
  callbackQuery: [
    // step = 0
    async (ctx: CallbackQueryContext) => {
      const category = (ctx.callbackQuery as CallbackQuery.DataQuery).data
      ctx.session.currentCommand!.step = 1
      await ctx.answerCbQuery('')
      const proteins = await db().manyOrNone<{ p: string }>(
        `select distinct unnest(proteins) as p from recipes where categories && $1::varchar[]`,
        [[category]]
      )
      const keyboardButtons = proteins.map((v) => ({
        text: capitalize(v.p),
        callback_data: JSON.stringify({ category, protein: v.p }),
      }))
      await ctx.editMessageText('Choose your protein', {
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },

    // step = 1
    async (ctx: CallbackQueryContext) => {
      const data = JSON.parse(
        (ctx.callbackQuery as CallbackQuery.DataQuery).data
      ) as { category: string; protein: string }
      ctx.session.currentCommand!.step = 2
      await ctx.answerCbQuery('')
      const recipes = (
        await db().manyOrNone<{ name: string }>(
          `select name from recipes 
            where categories && $1::varchar[] and proteins && $2::varchar[]
            order by name`,
          [[data.category], [data.protein]]
        )
      )
        .map((v) => `- <b>${v.name}</b>`)
        .join('\n')
      await ctx.editMessageText(`I found these options:\n${recipes}`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Perfect!',
                callback_data: 'ok',
              },
              {
                text: 'Find me something else',
                callback_data: 'find',
              },
            ],
          ],
        },
      })
    },
  ],
}
