// Rely on native drag events, rather than on the coordinates
// We have 3 "drag-handles" in this test. Their indexes are 0-based.
export function dragField(startIndex, dropIndex) {
  cy.get(".Icon-grabber").should("be.visible").as("dragHandle");

  const BUTTON_INDEX = 0;
  const SLOPPY_CLICK_THRESHOLD = 10;
  cy.get("@dragHandle")
    .eq(dropIndex)
    .then($target => {
      const coordsDrop = $target[0].getBoundingClientRect();
      cy.get("@dragHandle")
        .eq(startIndex)
        .then(subject => {
          const coordsDrag = subject[0].getBoundingClientRect();
          cy.wrap(subject)
            .trigger("mousedown", {
              button: BUTTON_INDEX,
              clientX: coordsDrag.x,
              clientY: coordsDrag.y,
              force: true,
            })
            .trigger("mousemove", {
              button: BUTTON_INDEX,
              clientX: coordsDrag.x + SLOPPY_CLICK_THRESHOLD,
              clientY: coordsDrag.y,
              force: true,
            });
          cy.get("body")
            .trigger("mousemove", {
              button: BUTTON_INDEX,
              clientX: coordsDrop.x,
              clientY: coordsDrop.y,
              force: true,
            })
            .trigger("mouseup");
        });
    });
}

export function dragAndDrop(subjectAlias, targetAlias) {
  const dataTransfer = new DataTransfer();

  cy.get("@" + subjectAlias).trigger("dragstart", { dataTransfer });
  cy.get("@" + targetAlias).trigger("drop", { dataTransfer });
  cy.get("@" + subjectAlias).trigger("dragend");
}
