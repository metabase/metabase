import { modelToUrl } from "./modelToUrl";
describe("urls > modelToUrl", () => {
  it("should return null for unknown model", () => {
    expect(
      // @ts-expect-error - testing the error case
      modelToUrl({
        model: "pikachu",
      }),
    ).toBeNull();
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
});
