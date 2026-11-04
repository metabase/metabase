import { act } from "__support__/ui";

import { reactNodeToHtmlString } from "./react-to-html";

describe("reactNodeToHtmlString", () => {
  it("should render a html string given a react node", () => {
    const node = <div>Hello, world!</div>;
    // The helper renders through `createRoot` and `flushSync`, so the render
    // it performs belongs inside act().
    let html = "";
    act(() => {
      html = reactNodeToHtmlString(node);
    });

    expect(html).toBe("<div>Hello, world!</div>");
  });
});
