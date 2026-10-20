import { parseCountRows, parseQuestionLabels } from "./rows";

describe("parseCountRows", () => {
  it("reads totals and groups, treating an empty value as not grouped", () => {
    expect(
      parseCountRows(
        ["k", "attr_1", "attr_2", "reached", "converted"],
        [
          [1, "", "", 1000, 250],
          [1, "Safari", "", 400, 80],
          [2, "Safari", "iOS", "300", "45"],
        ],
        ["attr_1", "attr_2"],
      ),
    ).toEqual([
      { question: 1, reached: 1000, converted: 250, conditions: [] },
      {
        question: 1,
        reached: 400,
        converted: 80,
        conditions: [{ attributeId: "attr_1", value: "Safari" }],
      },
      {
        question: 2,
        reached: 300,
        converted: 45,
        conditions: [
          { attributeId: "attr_1", value: "Safari" },
          { attributeId: "attr_2", value: "iOS" },
        ],
      },
    ]);
  });

  it("skips rows without readable counts", () => {
    expect(
      parseCountRows(["k", "reached", "converted"], [[1, null, 3]], []),
    ).toEqual([]);
  });
});

describe("parseQuestionLabels", () => {
  it("reads each question's label", () => {
    expect(
      parseQuestionLabels(
        ["k", "attr_1", "question_label", "reached", "converted"],
        [
          [1, "", "/pricing", 100, 20],
          ["2", "Safari", "/", 40, 4],
        ],
      ),
    ).toEqual(
      new Map([
        [1, "/pricing"],
        [2, "/"],
      ]),
    );
  });

  it("is empty when the population has no labels", () => {
    expect(
      parseQuestionLabels(["k", "reached", "converted"], [[1, 100, 20]]),
    ).toEqual(new Map());
  });
});
