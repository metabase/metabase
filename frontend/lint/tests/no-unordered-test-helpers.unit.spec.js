import { RuleTester } from "eslint";

import rule from "../eslint-rules/no-unordered-test-helpers";

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2015 } });

const orderError = {
  message: "H.restore() must come before H.resetTestTable()",
};

const blockTypes = ["it", "before", "beforeEach", "describe"];

const blockWrapper = (content, blockType = "it") => `
  ${blockType}('should test something', () => {
    ${content}
  });
`;

const validCases = [
  // Simple case - restore before reset
  `H.restore();
   H.resetTestTable();`,

  // Multiple resets after restore
  `H.restore();
   H.resetTestTable();
   H.resetTestTable();`,

  // Nested describe with inherited restore
  `describe('outer', () => {
    before(() => {
      H.restore();
    });

    describe('inner', () => {
      it('test', () => {
        H.resetTestTable();
      });
    });
  });`,

  // Restore in before hook
  `before(() => {
    H.restore();
  });

  it('test', () => {
    H.resetTestTable();
  });`,
];

const invalidCases = [
  // Reset before restore
  `H.resetTestTable();
   H.restore();`,

  // Reset without restore
  `H.resetTestTable();`,

  // Reset in nested describe without restore
  `describe('outer', () => {
    describe('inner', () => {
      it('test', () => {
        H.resetTestTable();
      });
    });
  });`,

  // Reset in before without restore
  `before(() => {
    H.resetTestTable();
  });`,
];

ruleTester.run("no-unordered-test-helpers", rule, {
  valid: blockTypes.flatMap((blockType) =>
    validCases.map((testCase) => ({
      code: blockWrapper(testCase, blockType),
    })),
  ),

  invalid: blockTypes.flatMap((blockType) =>
    invalidCases.map((testCase) => ({
      code: blockWrapper(testCase, blockType),
      errors: [orderError],
    })),
  ),
});
