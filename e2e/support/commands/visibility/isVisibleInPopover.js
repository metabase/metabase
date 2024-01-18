import { POPOVER_ELEMENT } from "e2e/support/helpers";

Cypress.Commands.add(
  "isVisibleInPopover",
  {
    prevSubject: true,
  },
  subject => {
    cy.wrap(subject)
      .closest(POPOVER_ELEMENT)
      .then($popover => {
        /**
         * Helper function that:
         *  1. Obtains the value of element's computed property, but it always returns it in px (for example: "12px")
         *  2. Returns that value as a floating point number (strips away the "px") which enables us to use it in later calculations
         */
        function getElementPropertyValue(property) {
          const propertyValue = window
            .getComputedStyle(subject[0], null)
            .getPropertyValue(property); /* [1] */

          return parseFloat(propertyValue); /* [2] */
        }

        const elementRect = subject[0].getBoundingClientRect();
        // We need to account for padding and borders to get the real height of an element because we're using `box-sizing: border-box`
        const PT = getElementPropertyValue("padding-top");
        const PB = getElementPropertyValue("padding-bottom");
        const BT = getElementPropertyValue("border-top");
        const BB = getElementPropertyValue("border-bottom");

        const elementTop = elementRect.top + PT + BT;
        const elementBottom = elementRect.bottom - PB - BB;

        const popoverRect = $popover[0].getBoundingClientRect();
        // We need the outermost dimensions for the container - no need to account for padding and borders
        const popoverTop = popoverRect.top;
        const popoverBottom = popoverRect.bottom;

        expect(elementTop).to.be.greaterThan(popoverTop);
        expect(elementBottom).to.be.greaterThan(popoverTop);
        expect(elementTop).not.to.be.greaterThan(popoverBottom);
        expect(elementBottom).not.to.be.greaterThan(popoverBottom);
      });
  },
);
