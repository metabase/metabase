export function dragAndDrop(subjectAlias, targetAlias) {
  const dataTransfer = new DataTransfer();

  cy.get("@" + subjectAlias).trigger("dragstart", { dataTransfer });
  cy.get("@" + targetAlias).trigger("drop", { dataTransfer });
  cy.get("@" + subjectAlias).trigger("dragend");
}

export function dragAndDropByElement(
  subjectEl,
  targetEl,
  options = { dragend: true },
) {
  const dataTransfer = new DataTransfer();
  subjectEl.trigger("dragstart", { dataTransfer });
  targetEl.trigger("drop", { dataTransfer });
  if (options.dragend) {
    subjectEl.trigger("dragend");
  }
}
