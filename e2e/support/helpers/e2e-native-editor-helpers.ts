import { codeMirrorHelpers } from "./e2e-codemirror-helpers";
import { popover } from "./e2e-ui-elements-helpers";

export function nativeEditorDataSource() {
  return cy.findAllByTestId("gui-builder-data").first();
}

export function selectNativeEditorDataSource(name: string) {
  nativeEditorDataSource().click();
  popover().findByText(name).click();
}

export const NativeEditor = codeMirrorHelpers("native-query-editor", {
  dataSource: nativeEditorDataSource,
  selectDataSource: selectNativeEditorDataSource,
});
