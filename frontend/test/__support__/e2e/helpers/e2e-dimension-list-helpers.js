export function getDimensions(isSelected) {
  if (typeof isSelected === "undefined") {
    return cy.findAllByTestId("dimension-list-item");
  }

  return cy.get(
    `[data-testid="dimension-list-item"][aria-selected="${isSelected}"]`,
  );
}

export function getDimensionByName({ name, index = 0, isSelected }) {
  return getDimensions(isSelected).filter(`:contains("${name}")`).eq(index);
}

export function getBinningButtonForDimension({ name, index, isSelected }) {
  return getDimensionByName({ name, index, isSelected })
    .realHover()
    .find(`[data-testid="dimension-list-item-binning"]`);
}

export function getAddDimensionButton({ name, index, isSelected }) {
  return getDimensionByName({ name, index, isSelected })
    .realHover()
    .find(`[aria-label="Add dimension"]`);
}

export function getRemoveDimensionButton({ name, index, isSelected }) {
  return getDimensionByName({ name, index, isSelected })
    .realHover()
    .find(`[aria-label="Remove dimension"]`);
}

export function changeBinningForDimension({
  name,
  fromBinning,
  toBinning,
  index,
  isSelected,
}) {
  const binningButton = getBinningButtonForDimension({
    name,
    index,
    isSelected,
  });

  if (fromBinning) {
    binningButton.should("have.text", fromBinning);
  }
  binningButton.click();

  cy.findByText(toBinning).click();
}
