import { Telegraf, session } from 'telegraf'
import { message } from 'telegraf/filters'
import logger from '@lib/logger'

import { Postgres } from '@telegraf/session/pg'
import { ContextWithSession } from './types'
import handlers from './handlers'
import { proteins } from './data'

const bot = new Telegraf<ContextWithSession>(process.env.TELEGRAM_BOT_TOKEN!)

bot.use(
  session({
    store: Postgres<any>({
      host: process.env.PG_HOST,
      port: 5432,
      database: process.env.PG_DB,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
    }),
  })
)

bot.use((ctx, _next) => {
  logger.debug(
    {
      message: ctx.message,
      session: ctx.session,
      update: ctx.update,
      updateType: ctx.updateType,
    },
    'Middleware call'
  )

  ctx.session ??= {
    currentCommand: null,
    config: { language: 'es', proteins },
  }

  if (ctx.chat?.type !== 'private') {
    throw new Error('Bot not allowed in groups')
  }

  // if (
  //   !ctx.chat.username ||
  //   !['demian85', 'SilvanaFontana'].includes(ctx.chat.username)
  // ) {
  //   throw new Error('Forbidden')
  // }

  return _next()
})

bot.start((ctx) => ctx.reply(`Hola! Soy experto en sugerirte recetas`))

bot.help((ctx) => ctx.reply('Qué necesitas?'))

bot.command('abort', async (ctx) => {
  ctx.session.currentCommand = null
  await ctx.reply(`Operación abortada`)
})

bot.command('config', async (ctx) => {
  await handlers.config.message[0](ctx)
})

bot.command('eat', async (ctx) => {
  await handlers.eat.message[0](ctx)
})

bot.on(message('text'), async (ctx) => {
  const prompt = ctx.message.text

  if (!prompt) {
    return ctx.reply(`/help`)
  }

  const cmd = ctx.session.currentCommand

  if (cmd !== null) {
    const cmdId = cmd.id as keyof typeof handlers
    const handler = handlers?.[cmdId].message[cmd.step]
    if (!handler) {
      await ctx.reply(`/help`)
      return
    }
    return handlers?.[cmdId].message[cmd.step](ctx)
  }

  await ctx.reply(`/help`)
})

bot.on('callback_query', async (ctx) => {
  const cmd = ctx.session.currentCommand

  if (!cmd) {
    return ctx.answerCbQuery('Invalid callback')
  }

  const cmdId = cmd.id as keyof typeof handlers
  const handler = handlers?.[cmdId].callbackQuery[cmd.step]

  // @ts-ignore
  if (handler) {
    return handler(ctx)
  }

  return ctx.answerCbQuery('Invalid callback')
})

bot.on('inline_query', async (ctx) => {
  await ctx.answerInlineQuery([])
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

export default bot
