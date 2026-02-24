import { defineConfig } from 'reactive-vscode'
import * as Meta from './generated/meta'

export const config = defineConfig<Meta.ScopedConfigKeyTypeMap>(Meta.scopedConfigs.scope)
