import { CallbackQueryContext } from '../types'

export async function callbackError(ctx: CallbackQueryContext): Promise<void> {
  await ctx.answerCbQuery(`Operación no válida`, { show_alert: true })
  return cancelCommand(ctx)
}

export async function cancelCommand(ctx: CallbackQueryContext): Promise<void> {
  ctx.session.currentCommand = null
}
