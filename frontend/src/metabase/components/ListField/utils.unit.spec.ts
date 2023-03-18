import { isValidOptionItem } from "./utils";

describe("ListField - utils", () => {
  describe("isValidOptionItem", () => {
    const TEST_CASES = [
      ["Marble Shoes", "marble", true],
      [[6, "Marble Shoes"], "marble", true],
      [[6, "Marble Shoes"], "6", true],
      [[6], "6", true],
      [[null, "Marble Shoes"], "marble", true],
      [[6, null], "6", true],
      [[6, "Marble Shoes"], "abcde", false],
    ];

    TEST_CASES.map(([optionItem, filter, expectedResult]) => {
      it(`includes "${filter}" in: ${optionItem}`, () => {
        const result = isValidOptionItem(optionItem, String(filter));
        expect(result).toEqual(expectedResult);
      });
    });
  });
});
