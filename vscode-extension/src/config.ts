import type * as Meta from './generated/meta'
import { defineConfig } from 'reactive-vscode'

export const config = defineConfig<Meta.NestedConfigs['metastudio']>('metastudio')
