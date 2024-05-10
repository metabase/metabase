import { modelToUrl } from "./modelToUrl";
describe("urls > modelToUrl", () => {
  it("should return null for unknown model", () => {
    expect(
      modelToUrl({
        // @ts-expect-error - testing the error case
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
        parent_collection: {
          id: 1,
          name: "My Cool Collection",
        },
        timestamp: "2021-01-01T00:00:00.000Z",
      }),
    ).toBe("/question/101-my-cool-question");
  });

  it("should return a model URL for a dataset", () => {
    expect(
      modelToUrl({
        model: "dataset",
        name: "My Cool Dataset",
        parent_collection: {
          id: 1,
          name: "My Cool Collection",
        },
        id: 101,
        timestamp: "2021-01-01T00:00:00.000Z",
      }),
    ).toBe("/model/101-my-cool-dataset");
  });

  it("should return a dashboard URL for a dashboard", () => {
    expect(
      modelToUrl({
        model: "dashboard",
        name: "My Cool Dashboard",
        parent_collection: {
          id: 1,
          name: "My Cool Collection",
        },
        id: 101,
        timestamp: "2021-01-01T00:00:00.000Z",
      }),
    ).toBe("/dashboard/101-my-cool-dashboard");
  });

  it("should return a collection URL for a collection", () => {
    expect(
      modelToUrl({
        model: "collection",
        name: "My Cool Collection",
        id: 1,
        parent_collection: {
          id: 1,
          name: "My Cool Collection",
        },
        timestamp: "2021-01-01T00:00:00.000Z",
      }),
    ).toBe("/collection/1-my-cool-collection");
  });

  it("should return a table URL for a table", () => {
    expect(
      modelToUrl({
        model: "table",
        name: "MY_COOL_TABLE",
        display_name: "My Cool Table",
        id: 33,
        database: {
          id: 22,
          name: "My Cool Database",
          initial_sync_status: "complete",
        },
        timestamp: "2021-01-01T00:00:00.000Z",
      }),
    ).toBe("/question/#?db=22&table=33");
  });
});
