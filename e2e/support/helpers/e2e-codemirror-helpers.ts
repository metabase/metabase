export function codeMirrorEditor() {
  return cy.get(".cm-content");
}
export function codeMirrorValue() {
  // Get the multiline text content of the editor
  return codeMirrorEditor()
    .get("[role='textbox']")
    .get(".cm-line")
    .then((lines) => {
      const text: string[] = [];
      lines.each((_, line) => {
        text.push(line.textContent ?? "");
      });
      const value = text.join("\n");
      const placeholder = "SELECT * FROM TABLE_NAME";
      if (value === placeholder) {
        return "";
      }
      return value;
    });
}
