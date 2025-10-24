import type { MetabaseProtocolEntity } from "./links";
import {
  createMetabaseProtocolLink,
  parseMetabaseProtocolLink,
  parseMetabaseProtocolMarkdownLink,
} from "./links";

describe("parseMetabaseProtocolLink", () => {
  it("should parse metabase://model/id for various entities", () => {
    expect(parseMetabaseProtocolLink("metabase://question/123")).toEqual({
      id: 123,
      model: "question",
    });
    expect(parseMetabaseProtocolLink("metabase://dashboard/456")).toEqual({
      id: 456,
      model: "dashboard",
    });
    expect(parseMetabaseProtocolLink("metabase://collection/789")).toEqual({
      id: 789,
      model: "collection",
    });
    expect(parseMetabaseProtocolLink("metabase://model/111")).toEqual({
      id: 111,
      model: "model",
    });
  });

  it("should return undefined for invalid protocol", () => {
    expect(parseMetabaseProtocolLink("blah://")).toBeUndefined();
  });

  it("should return undefined for unsupported entity models", () => {
    expect(
      parseMetabaseProtocolLink("metabase://unsupported/123"),
    ).toBeUndefined();
  });

  it("should return undefined for non-numeric IDs", () => {
    expect(
      parseMetabaseProtocolLink("metabase://question/abc"),
    ).toBeUndefined();
  });
});

describe("parseMetabaseProtocolMarkdownLink", () => {
  it("should parse markdown format [Name](metabase://model/id)", () => {
    expect(
      parseMetabaseProtocolMarkdownLink(
        "[My Question](metabase://question/123)",
      ),
    ).toEqual({
      id: 123,
      model: "question",
      name: "My Question",
    });
  });

  it("should parse different entity models with names", () => {
    expect(
      parseMetabaseProtocolMarkdownLink(
        "[Sales Dashboard](metabase://dashboard/456)",
      ),
    ).toEqual({
      id: 456,
      model: "dashboard",
      name: "Sales Dashboard",
    });

    expect(
      parseMetabaseProtocolMarkdownLink(
        "[Reports Collection](metabase://collection/789)",
      ),
    ).toEqual({
      id: 789,
      model: "collection",
      name: "Reports Collection",
    });
  });

  it("should handle names with special characters", () => {
    expect(
      parseMetabaseProtocolMarkdownLink(
        "[Data & Analytics: Q1 Report](metabase://question/123)",
      ),
    ).toEqual({
      id: 123,
      model: "question",
      name: "Data & Analytics: Q1 Report",
    });
  });

  it("should return undefined for invalid markdown format", () => {
    expect(
      parseMetabaseProtocolMarkdownLink(
        "My Question](metabase://question/123)",
      ),
    ).toBeUndefined();
    expect(
      parseMetabaseProtocolMarkdownLink(
        "[My Question(metabase://question/123)",
      ),
    ).toBeUndefined();
    expect(
      parseMetabaseProtocolMarkdownLink("[My Question](http://example.com)"),
    ).toBeUndefined();
  });

  it("should return undefined for unsupported entity models", () => {
    expect(
      parseMetabaseProtocolMarkdownLink("[Test](metabase://unsupported/123)"),
    ).toBeUndefined();
  });
});

describe("createMetabaseProtocolLink", () => {
  it("should create a valid metabase protocol link", () => {
    const entity: MetabaseProtocolEntity = {
      id: 123,
      model: "question",
      name: "My Question",
    };

    const result = createMetabaseProtocolLink(entity);
    expect(result).toBe("[My Question](metabase://question/123)");
  });

  it("should create links for different entity models", () => {
    expect(
      createMetabaseProtocolLink({
        id: 456,
        model: "dashboard",
        name: "Sales Dashboard",
      }),
    ).toBe("[Sales Dashboard](metabase://dashboard/456)");

    expect(
      createMetabaseProtocolLink({
        id: 789,
        model: "collection",
        name: "Reports",
      }),
    ).toBe("[Reports](metabase://collection/789)");
  });

  it("should handle names with special characters", () => {
    expect(
      createMetabaseProtocolLink({
        id: 123,
        model: "question",
        name: "Data & Analytics: Q1 Report",
      }),
    ).toBe("[Data & Analytics: Q1 Report](metabase://question/123)");
  });

  it("should handle empty name", () => {
    expect(
      createMetabaseProtocolLink({
        id: 123,
        model: "question",
        name: "",
      }),
    ).toBe("[](metabase://question/123)");
  });
});
