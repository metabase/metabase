import { RuleTester } from "eslint";

import rule from "../eslint-rules/no-unsafe-element-filtering";

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2015 } });

const unsafeError = {
  messageId: "unexpected",
};

const blockTypes = ["it", "before", "beforeEach", "it.only"];

const blockWrapper = (content, blockType = "it") => `
  ${blockType}('should test something', () => {
    ${content}
  });
`;

const validCases = [
  `cy.get('.list').should('have.length', 3).last();`,
  `cy.get('.items').should('have.length.gt', 0).last();`,
  `cy.get('.items').should('have.length.gte', 1).last();`,
  `cy.get('.items').should('have.length', 5).eq(-1);`,
  `cy.get('.items').should('have.length.at.least', 1).last();`,
  `cy.get('.items').should('have.length.above', 0).last();`,
  `cy.get('.items').should('have.lengthOf', 3).last();`,
  `cy.get('.items').should('have.length.within', 1, 5).last();`,
  `cy.get('.items').eq(1);`, // positive indices are fine
  `cy.get('.items').first();`, // first() is fine
  // Non-Cypress contexts should be ignored
  `const array = [1, 2, 3]; array.last(); array.eq(-1);`,
];

const invalidCases = [
  `cy.get('.list').last();`,
  `cy.get('.items').last().click();`,
  `cy.get('.items').eq(-1);`,
  `cy.get('.items').eq(-2).click();`,
  `cy.get('.items').find('div').last();`,
  `cy.get('.items').find('div').eq(-1);`,
  // Dynamic indices should be caught
  `cy.get('.items').eq(someVariable);`,
  `cy.get('.items').eq(getIndex());`,
];

ruleTester.run("no-unsafe-element-filtering", rule, {
  valid: blockTypes.flatMap((blockType) =>
    validCases.map((testCase) => ({
      code: blockWrapper(testCase, blockType),
    })),
  ),

  invalid: blockTypes.flatMap((blockType) =>
    invalidCases.map((testCase) => ({
      code: blockWrapper(testCase, blockType),
      errors: [unsafeError],
    })),
  ),
});
