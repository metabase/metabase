import { defineConfig } from 'reactive-vscode'
import type * as Meta from './generated/meta'

export const config = defineConfig<Meta.NestedConfigs['metastudio']>('metastudio')
