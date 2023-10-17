import { Context, NarrowedContext } from 'telegraf'
import {
  CallbackQuery,
  Message,
  Update,
} from 'telegraf/typings/core/types/typegram'

export interface FoodStockItem {
  name: string
  category: string
  stock: number
  expiry: string
}

export type FoodStockList = FoodStockItem[]

export type MessageContext = NarrowedContext<
  ContextWithSession<Update>,
  Update.MessageUpdate<Record<'text', {}> & Message.TextMessage>
>

export type CallbackQueryContext = NarrowedContext<
  ContextWithSession,
  Update.CallbackQueryUpdate<CallbackQuery>
>

export interface CurrentCommand {
  id: string
  step: number
  subcommand?: string
  data?: string
}

export interface Recipe {
  title: string
  ingredients: string[]
  description: string
}

export interface EatCommand extends CurrentCommand {
  id: 'eat'
  category: string
  protein: string
  recipes: Recipe[]
}

export interface Session {
  currentCommand: CurrentCommand | null
}

export interface ContextWithSession<U extends Update = Update>
  extends Context<U> {
  session: {
    currentCommand: CurrentCommand | null
    config: {
      language: string
      dietaryRestrictions: string
    }
  }
}

export interface Handler {
  message: Array<(ctx: MessageContext) => Promise<void>>
  callbackQuery: Array<(ctx: CallbackQueryContext) => Promise<void>>
}
