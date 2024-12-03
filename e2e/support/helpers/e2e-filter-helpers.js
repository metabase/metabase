import {
  entityPickerModal,
  modal,
  popover,
} from "e2e/support/helpers/e2e-ui-elements-helpers";

export function setDropdownFilterType() {
  cy.findByText("Dropdown list").click();
}

export function setSearchBoxFilterType() {
  cy.findByText("Search box").click();
}

export function setFilterQuestionSource({ question, field }) {
  cy.findByText("Edit").click();

  modal().within(() => {
    cy.findByText("From another model or question").click();
    cy.findByText("Pick a model or question…").click();
  });

  entityPickerModal().within(() => {
    cy.findByText(question).click();
  });

  modal().within(() => {
    cy.findByText("Pick a column…").click();
  });

  popover().within(() => {
    cy.findByText(field).click();
  });

  modal().within(() => {
    cy.button("Done").click();
  });
}

export function setFilterListSource({ values }) {
  cy.findByText("Edit").click();

  modal().within(() => {
    cy.findByText("Custom list").click();
    cy.findByRole("textbox")
      .clear()
      .type(
        values
          .map(value => {
            if (Array.isArray(value)) {
              return value.join(", ");
            }
            return value;
          })
          .join("\n"),
      );
    cy.button("Done").click();
  });
}

export function checkFilterListSourceHasValue({ values }) {
  cy.findByText("Edit").click();

  const expectedString = values
    .map(value => {
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      return value;
    })
    .join("\n");

  modal().within(() => {
    cy.findByText("Custom list").click();
    cy.findByRole("textbox").should("have.value", expectedString);
    cy.icon("close").click();
  });
}

export function setConnectedFieldSource(table, field) {
  popover().findByText(table).click();
  popover().findByText(field).click();
}
