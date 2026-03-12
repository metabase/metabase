import { modelToUrl } from "./modelToUrl";

describe("urls > modelToUrl", () => {
  it("should return 404 for unknown model", () => {
    expect(
      // @ts-expect-error - testing the error case
      modelToUrl({
        model: "pikachu",
      }),
    ).toContain("/404");
  });

  it("should return a question URL for a card", () => {
    expect(
      modelToUrl({
        model: "card",
        name: "My Cool Question",
        id: 101,
      }),
    ).toBe("/question/101-my-cool-question");
  });

  it("should return a model URL for a dataset", () => {
    expect(
      modelToUrl({
        model: "dataset",
        name: "My Cool Dataset",
        id: 101,
      }),
    ).toBe("/model/101-my-cool-dataset");
  });

  it("should return a dashboard URL for a dashboard", () => {
    expect(
      modelToUrl({
        model: "dashboard",
        name: "My Cool Dashboard",
        id: 101,
      }),
    ).toBe("/dashboard/101-my-cool-dashboard");
  });

  it("should return a collection URL for a collection", () => {
    expect(
      modelToUrl({
        model: "collection",
        name: "My Cool Collection",
        id: 1,
      }),
    ).toBe("/collection/1-my-cool-collection");
  });

  it("should return a table URL for a table", () => {
    expect(
      modelToUrl({
        model: "table",
        name: "MY_COOL_TABLE",
        id: 33,
        database: {
          id: 22,
        },
      }),
    ).toBe("/question#?db=22&table=33");
  });

  it("should return a document URL for a document", () => {
    expect(
      modelToUrl({
        model: "document",
        name: "My Cool Document",
        id: 123,
      }),
    ).toBe("/document/123");
  });

  it("should return an action URL for an action", () => {
    expect(
      modelToUrl({
        model: "action",
        name: "My Cool Action",
        id: 123,
        model_id: 456,
      }),
    ).toBe("/model/456/detail/actions/123");
  });

  it("should return a segment URL for a segment", () => {
    expect(
      modelToUrl({
        model: "segment",
        name: "My Cool Segment",
        id: 123,
        database_id: 456,
        table_id: 789,
      }),
    ).toBe("/question#?db=456&table=789&segment=123");
  });

  it("should return a measure URL for a measure", () => {
    expect(
      modelToUrl({
        model: "measure",
        name: "My Cool Measure",
        id: 123,
        table_id: 456,
      }),
    ).toBe("/data-studio/library/tables/456/measures/123");
  });

  it("should return 404 for a measure without table_id", () => {
    expect(
      modelToUrl({
        model: "measure",
        name: "My Cool Measure",
        id: 123,
      }),
    ).toBe("/404");
  });
});
