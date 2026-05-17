import { act } from "__support__/ui-minimal";

import { reactNodeToHtmlString } from "./react-to-html";

describe("reactNodeToHtmlString", () => {
  it("should render a html string given a react node", () => {
    const node = <div>Hello, world!</div>;
    let html = "";

    act(() => {
      html = reactNodeToHtmlString(node);
    });

    expect(html).toBe("<div>Hello, world!</div>");
  });
});
