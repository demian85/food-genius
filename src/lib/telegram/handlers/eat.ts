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
      await ctx.reply(`Elige la categoría`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [keyboardButtons] },
      })
    },
  ],
  callbackQuery: [
    // step = 0
    async (ctx: CallbackQueryContext) => {
      const category = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 1
      currentCommand.category = category

      await ctx.answerCbQuery('')

      const proteins = await db().manyOrNone<{ p: string }>(
        `select distinct unnest(proteins) as p 
          from recipes 
          where categories && $1::varchar[]`,
        [[category]]
      )

      if (!proteins.length) {
        await ctx.editMessageText('No se han encontrado recetas')
        return
      }

      const keyboardButtons = proteins.map((v) => ({
        text: capitalize(v.p),
        callback_data: v.p,
      }))

      await ctx.editMessageText('Elige la proteína', {
        reply_markup: {
          inline_keyboard: buildKeyboardButtons(keyboardButtons),
        },
      })
    },

    // step = 1
    async (ctx: CallbackQueryContext) => {
      const protein = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      currentCommand.step = 2
      currentCommand.protein = protein

      await ctx.answerCbQuery('')

      const recipes: Recipe[] = await db().manyOrNone<{
        title: string
        description: string
        ingredients: string[]
      }>(
        `select name as title, ingredients, description
            from recipes 
            where categories && $1::varchar[] and proteins && $2::varchar[]
            order by name
            limit 6`,
        [[currentCommand.category], [protein]]
      )

      currentCommand.recipes = recipes

      await handleRecipeOptions(ctx, false)
    },

    // step = 2
    async (ctx: CallbackQueryContext) => {
      const callbackData = (ctx.callbackQuery as CallbackQuery.DataQuery).data

      const currentCommand = ctx.session.currentCommand as EatCommand
      // currentCommand.step = 3

      await ctx.answerCbQuery('')

      if (callbackData === 'ok') {
        ctx.session.currentCommand = null
        ctx.editMessageReplyMarkup({ inline_keyboard: [] })
        return
      }

      if (callbackData === 'other') {
        ctx.sendChatAction('typing')
        try {
          currentCommand.recipes = await searchRecipes(
            currentCommand.protein,
            3,
            currentCommand.recipes.map((v) => v.title)
          )
        } catch (err) {
          await ctx.editMessageText(
            `Ha ocurrido un error en la búsqueda. Intenta de nuevo.`
          )
          return
        }
        await handleRecipeOptions(ctx)
        return
      }

      const currentRecipe = currentCommand.recipes[+callbackData]
      await handleRecipeDescription(ctx, currentRecipe)
    },
  ],
}

async function handleRecipeOptions(
  ctx: CallbackQueryContext,
  allowExpandDescription = true
) {
  const currentCommand = ctx.session.currentCommand as EatCommand
  const recipes = currentCommand.recipes
  const messageText = `Encontré las siguientes recetas. Elige una para mas detalles:\n\n${recipes
    .map((v, k) => `${k + 1}) ${v.title}`)
    .join('\n')}`
  const keyboardButtons = allowExpandDescription
    ? recipes.map((v, k) => ({
        text: `${k + 1})`,
        callback_data: String(k),
      }))
    : []
  await ctx.editMessageText(messageText, {
    reply_markup: {
      inline_keyboard: [
        keyboardButtons,
        [
          { text: '👍 Listo!', callback_data: 'ok' },
          { text: '🍔 Otras opciones', callback_data: 'other' },
        ],
      ],
    },
  })
}

async function handleRecipeDescription(
  ctx: CallbackQueryContext,
  recipe: Recipe
) {
  await ctx.editMessageText(`<b>${recipe.title}</b>\n${recipe.description}`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👍 Listo!', callback_data: 'ok' },
          { text: '🍔 Otras opciones', callback_data: 'other' },
        ],
      ],
    },
  })
}

async function searchRecipes(
  protein: string,
  n = 3,
  ignore?: string[]
): Promise<Recipe[]> {
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
            description: {
              type: 'string',
              description: 'Instrucciones de como preparar la receta',
            },
          },
        },
      },
    },
  }

  const ignoreText =
    ignore && ignore.length > 0
      ? `Ignora las siguientes recetas: ${ignore.join(', ')}`
      : ''
  const result = await openai.chat.completions.create({
    stream: false,
    messages: [
      {
        content: 'Eres un asistente que sugiere recetas de cocina',
        role: 'system',
      },
      {
        content: `Devuelve ${n} recetas usando ${protein} como proteína principal. ${ignoreText}`,
        role: 'user',
      },
    ],
    model: 'gpt-3.5-turbo',
    functions: [{ name: 'set_recipe', parameters: jsonSchema }],
    function_call: { name: 'set_recipe' },
  })

  logger.debug(
    { responseMessage: result.choices[0].message },
    'OpenAI response'
  )

  const responseList = JSON.parse(
    result.choices[0].message.function_call?.arguments ?? '{}'
  ) as { data: Recipe[] }

  return responseList.data
}

function buildKeyboardButtons(
  btns: InlineKeyboardButton[]
): InlineKeyboardButton[][] {
  const keyboard: InlineKeyboardButton[][] = []
  btns.forEach((btn, index) => {
    if (index % 3 === 0) {
      keyboard.push([])
    }
    keyboard[keyboard.length - 1].push(btn)
  })
  return keyboard
}
