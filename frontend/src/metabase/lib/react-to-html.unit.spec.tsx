import { reactNodeToHtmlString } from "./react-to-html";

describe("reactNodeToHtmlString", () => {
  it("should render a html string given a react node", () => {
    const node = <div>Hello, world!</div>;
    const html = reactNodeToHtmlString(node);

    expect(html).toBe("<div>Hello, world!</div>");
  });
});
