import { createTemplateTag } from "metabase-lib/lib/queries/TemplateTag";

describe("createTemplateTag", () => {
  it("should create a proper template tag", () => {
    const tag = createTemplateTag("stars");
    expect(tag.name).toEqual("stars");
    expect(tag.type).toEqual("text");
    expect(typeof tag.id).toEqual("string");
    expect(tag["display-name"]).toEqual("Stars");
  });
});
