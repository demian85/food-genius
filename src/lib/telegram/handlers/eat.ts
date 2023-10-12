import {
  CallbackQuery,
  InlineKeyboardButton,
} from 'telegraf/typings/core/types/typegram'
import {
  CallbackQueryContext,
  EatCommand,
  MessageContext,
  Recipe,
} from '../types'
import { db } from '@lib/db'
import { capitalize } from 'lodash'
import OpenAI from 'openai'
import logger from '@lib/logger'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
      await ctx.reply(`Elije la categoría:`, {
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
      await ctx.editMessageText('Elije la proteína:', {
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
      await ctx.editMessageText(`Encontré estas opciones:\n${recipes}`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '👍',
                callback_data: JSON.stringify({ ...data, search: false }),
              },
              {
                text: 'Otras opciones',
                callback_data: JSON.stringify({ ...data, search: true }),
              },
            ],
          ],
        },
      })
    },

    // step = 2
    async (ctx: CallbackQueryContext) => {
      const callbackData = JSON.parse(
        (ctx.callbackQuery as CallbackQuery.DataQuery).data
      ) as { category: string; protein: string; search: boolean }

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 3

      await ctx.answerCbQuery('')

      if (callbackData.search) {
        ctx.sendChatAction('typing')
        const jsonSchema = {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Título descriptivo de la receta',
                  },
                  ingredients: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista de ingredientes usados',
                  },
                  instructions: {
                    type: 'array',
                    description:
                      'Descripción completa de como preparar la receta',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        }
        const result = await openai.chat.completions.create({
          stream: false,
          messages: [
            {
              content: 'Eres un asistente que sugiere recetas de cocina',
              role: 'system',
            },
            {
              content: `Devuelve 3 recetas usando ${callbackData.protein} como proteína principal.`,
              role: 'user',
            },
          ],
          model: 'gpt-3.5-turbo',
          functions: [{ name: 'set_recipe', parameters: jsonSchema }],
          function_call: { name: 'set_recipe' },
        })

        logger.debug({ responseMessage: result.choices[0].message })

        const responseList = JSON.parse(
          result.choices[0].message.function_call?.arguments ?? '{}'
        ) as { data: Recipe[] }

        const messageText = `Encontré las siguientes recetas. Elige una para mas detalles:\n${responseList.data
          .map((v, k) => `${k + 1}) ${v.title}`)
          .join('\n')}`

        currentCommand.recipes = responseList.data

        const keyboardButtons = responseList.data.map((v, k) => ({
          text: `${k + 1})`,
          callback_data: String(k),
        }))
        await ctx.editMessageText(messageText, {
          reply_markup: {
            inline_keyboard: [
              [...keyboardButtons, { text: 'Listo!', callback_data: 'close' }],
            ],
          },
        })
      }
    },

    // step = 3
    async (ctx: CallbackQueryContext) => {
      const callbackData = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 4

      await ctx.answerCbQuery('')

      if (callbackData === 'close') {
        ctx.session.currentCommand = null
        ctx.editMessageReplyMarkup({ inline_keyboard: [] })
        return
      }

      await ctx.editMessageText(
        currentCommand.recipes[+callbackData].instructions
          .map((line) => `- ${line.trim()}`)
          .join('\n'),
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👍', callback_data: 'ok' },
                { text: 'Otra opción', callback_data: 'other' },
              ],
            ],
          },
        }
      )
    },

    // step = 4
    async (ctx: CallbackQueryContext) => {
      const data = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand

      await ctx.answerCbQuery('')

      if (data === 'ok') {
        ctx.session.currentCommand = null
        ctx.editMessageReplyMarkup({ inline_keyboard: [] })
        return
      }

      currentCommand.step = 3

      await ctx.answerCbQuery('')

      const recipes = currentCommand.recipes
      const messageText = `Encontré las siguientes recetas. Elige una para mas detalles:\n${recipes
        .map((v, k) => `${k + 1}) ${v.title}`)
        .join('\n')}`
      const keyboardButtons = recipes.map((v, k) => ({
        text: `${k + 1})`,
        callback_data: String(k),
      }))
      await ctx.editMessageText(messageText, {
        reply_markup: {
          inline_keyboard: [
            [...keyboardButtons, { text: 'Listo!', callback_data: 'close' }],
          ],
        },
      })
    },
  ],
}
