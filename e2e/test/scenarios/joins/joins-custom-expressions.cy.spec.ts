const { H } = cy;

type TestCase = {
  lhsExpression: string;
  rhsExpression: string;
  expectedScalarValue: string;
};

function testJoin({
  lhsExpression,
  rhsExpression,
  expectedScalarValue,
}: TestCase) {
  cy.log(`${lhsExpression} = ${rhsExpression}`);
  H.openOrdersTable({ mode: "notebook" });
  H.join();
  H.entityPickerModal().within(() => {
    H.entityPickerModalTab("Tables").click();
    cy.findByText("Reviews").click();
  });
  H.popover().within(() => {
    cy.findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: lhsExpression });
    cy.button("Done").click();
  });
  H.popover().within(() => {
    cy.findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: rhsExpression });
    cy.button("Done").click();
  });
  H.summarize({ mode: "notebook" });
  H.popover().findByText("Count of rows").click();
  H.visualize();
  cy.findByTestId("scalar-value").should("have.text", expectedScalarValue);
}

const LITERAL_TEST_CASES: TestCase[] = [
  {
    lhsExpression: "0",
    rhsExpression: "0",
    expectedScalarValue: "20,861,120",
  },
  {
    lhsExpression: "1",
    rhsExpression: "1",
    expectedScalarValue: "20,861,120",
  },
  {
    lhsExpression: "1",
    rhsExpression: "0",
    expectedScalarValue: "18,760",
  },
  {
    lhsExpression: "false",
    rhsExpression: "false",
    expectedScalarValue: "20,861,120",
  },
  {
    lhsExpression: "true",
    rhsExpression: "true",
    expectedScalarValue: "20,861,120",
  },
  {
    lhsExpression: "false",
    rhsExpression: "true",
    expectedScalarValue: "18,760",
  },
];

const EXPRESSION_TEST_CASES: TestCase[] = [
  {
    lhsExpression: "1 + 2",
    rhsExpression: "2 + 1",
    expectedScalarValue: "20,861,120",
  },
  {
    lhsExpression: "[ID] + [User ID]",
    rhsExpression: "[ID] + [Rating]",
    expectedScalarValue: "19,048",
  },
  {
    lhsExpression: "month([Created At])",
    rhsExpression: "month([Created At]",
    expectedScalarValue: "1,761,044",
  },
];

describe("scenarios > joins > custom expressions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should support literals in join conditions", () => {
    LITERAL_TEST_CASES.forEach(testJoin);
  });

  it("should support expressions in join conditions", () => {
    EXPRESSION_TEST_CASES.forEach(testJoin);
  });
});
