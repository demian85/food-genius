import eatHandlers from './eat'
import configHandlers from './config'
import { Handler } from '../types'

const handlers: Record<string, Handler> = {
  eat: eatHandlers,
  config: configHandlers,
}

export default handlers
