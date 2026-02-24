import { defineExtension } from 'reactive-vscode'
import { window } from 'vscode'

const { activate, deactivate } = defineExtension(() => {
  window.showInformationMessage('Hello')
})

export { activate, deactivate }
