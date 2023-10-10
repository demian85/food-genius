import languageHandlers from './language'
import eatHandlers from './eat'
import { Handler } from '../types'

const handlers: Record<string, Handler> = {
  language: languageHandlers,
  eat: eatHandlers,
}

export default handlers
