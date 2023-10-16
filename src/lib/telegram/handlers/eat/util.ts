import { db } from '@lib/db'
import logger from '@lib/logger'
import { CallbackQueryContext, EatCommand, Recipe } from '@lib/telegram/types'
import OpenAI from 'openai'
import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function handleRecipeOptions(
  ctx: CallbackQueryContext,
  allowExpandDescription = true
) {
  const currentCommand = ctx.session.currentCommand as EatCommand
  const recipes = currentCommand.recipes
  const messageText = `Encontré las siguientes recetas.${
    allowExpandDescription ? `Elige una para mas detalles:` : ``
  }\n\n${recipes.map((v, k) => `${k + 1}) ${v.title}`).join('\n')}`
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
          { text: '🧐 Otras opciones', callback_data: 'other' },
        ],
      ],
    },
  })
}

export async function handleRecipeDescription(
  ctx: CallbackQueryContext,
  recipe: Recipe
) {
  await ctx.editMessageText(`<b>${recipe.title}</b>\n${recipe.description}`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👍 Listo!', callback_data: 'ok' },
          { text: '🧐 Otras opciones', callback_data: 'other' },
        ],
      ],
    },
  })
}

export async function searchLocalRecipes(
  category: string,
  protein: string | null
): Promise<Recipe[]> {
  const recipes = await db().manyOrNone<Recipe>(
    `select name as title, ingredients, description
      from recipes 
      where categories && $1::varchar[] 
        and ($2 is null or proteins && $2::varchar[])
      order by name
      limit 6`,
    [[category], protein ? [protein] : null]
  )

  return recipes
}

export async function searchRecipesUsingOpenAI(
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

export function buildKeyboardButtons(
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
