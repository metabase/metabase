import React from "react";
import renderer from "react-test-renderer";

import TokenizedExpression from "metabase/query_builder/components/expressions/TokenizedExpression";

const TEST_EXPRESSIONS = [
  "Count",
  "Sum(Subtotal)",
  'Sum("Foo Bar")',
  "1 + Sum(2 + Total)",
];

describe("TokenizedExpression", () => {
  for (const expression of TEST_EXPRESSIONS) {
    it(`should render: ${expression}`, () => {
      const tree = renderer
        .create(<TokenizedExpression source={expression} />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });
  }
});
