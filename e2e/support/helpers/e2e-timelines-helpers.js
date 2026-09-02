export function timelineEventCard(eventName) {
  return cy.findByText(eventName).closest("[aria-label='Timeline event card']");
}

export function timelineEventVisibility(eventName) {
  return timelineEventCard(eventName).findByRole("checkbox");
}

export function waitForTimelinesAfterCreatingAnEvent(eventName) {
  return timelineEventCard(eventName)
    .findByText(/^Bobby Tables added this on/)
    .should("be.visible");
}
