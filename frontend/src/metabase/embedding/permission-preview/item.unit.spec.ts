import {
  NOT_FOUND_ITEM,
  getContentUrl,
  getItemFromContentPath,
  getItemFromLink,
  getLinkText,
  isContentPath,
  parseItem,
} from "./item";

describe("getItemFromLink", () => {
  it.each([
    ["http://localhost:3000/dashboard/12-sales-overview", "dashboard/12"],
    ["/question/133-orders-by-state", "question/133"],
    ["/collection/7-reports?tab=1", "collection/7"],
    ["/collection/root", "collection/root"],
    ["/collection/all", "collection/all"],
    ["/model/5-people", "question/5"],
    ["/metric/6", "question/6"],
  ])("reads %s as %s", (link, item) => {
    expect(getItemFromLink(link)).toBe(item);
  });

  it.each(["/", "http://localhost:3000/", "  /  "])(
    "reads the root path %p as All collections",
    (link) => {
      expect(getItemFromLink(link)).toBe("collection/all");
    },
  );

  it.each([
    "",
    "42",
    "hello",
    "/admin/settings",
    "/dashboard/abc",
    "/question/",
  ])("reads %p as no item", (link) => {
    expect(getItemFromLink(link)).toBe(NOT_FOUND_ITEM);
  });
});

describe("parseItem", () => {
  it("reads the three kinds of item the frame opens", () => {
    expect(parseItem("collection/root")).toEqual({
      type: "collection",
      id: "root",
    });
    expect(parseItem("collection/all")).toEqual({
      type: "collection",
      id: "all",
    });
    expect(parseItem("collection/9")).toEqual({ type: "collection", id: 9 });
    expect(parseItem("dashboard/12")).toEqual({ type: "dashboard", id: 12 });
    expect(parseItem("question/133")).toEqual({ type: "question", id: 133 });
  });

  it("reads anything else as no item", () => {
    expect(parseItem(NOT_FOUND_ITEM)).toBeNull();
    expect(parseItem("dashboard/root")).toBeNull();
    expect(parseItem("question/1x")).toBeNull();
  });
});

describe("content path", () => {
  it("round-trips an item through the content document's path", () => {
    const url = getContentUrl("dashboard/12");

    expect(url).toBe("/embed/permission-preview-content/dashboard/12");
    expect(isContentPath(url)).toBe(true);
    expect(getItemFromContentPath(url)).toBe("dashboard/12");
  });

  it("is not the path of the other embed pages", () => {
    expect(isContentPath("/embed/question/abc")).toBe(false);
  });
});

describe("getLinkText", () => {
  it("shows All collections as the root path and any other item as its path", () => {
    expect(getLinkText("collection/all")).toBe("/");
    expect(getLinkText("dashboard/12")).toBe("/dashboard/12");
  });
});
