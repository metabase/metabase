import { render } from "@testing-library/react";
import { setNonce } from "get-nonce";

import { GlobalStyleSheet } from "./GlobalStyleSheet";

const getSheets = () =>
  // eslint-disable-next-line testing-library/no-node-access -- the sheet lives in the head, outside the React tree
  document.head.querySelectorAll<HTMLStyleElement>(
    "style[data-global-style-sheet]",
  );

describe("GlobalStyleSheet", () => {
  it("should append the styles to the document head with the CSP nonce", () => {
    setNonce("2726c7f26c");
    render(<GlobalStyleSheet styles=":root { --mb-color-brand: #509ee3; }" />);

    const sheets = getSheets();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toHaveTextContent(":root { --mb-color-brand: #509ee3; }");
    expect(sheets[0]).toHaveAttribute("nonce", "2726c7f26c");
  });

  it("should update the same element so it keeps its place in the head", () => {
    const { rerender } = render(
      <GlobalStyleSheet styles="body { color-scheme: light; }" />,
    );
    const [sheet] = getSheets();
    const laterSheet = document.createElement("style");
    document.head.appendChild(laterSheet);

    rerender(<GlobalStyleSheet styles="body { color-scheme: dark; }" />);

    expect(getSheets()).toHaveLength(1);
    expect(getSheets()[0]).toBe(sheet);
    expect(sheet).toHaveTextContent("body { color-scheme: dark; }");
    // eslint-disable-next-line testing-library/no-node-access -- the sheet lives in the head, outside the React tree
    expect(sheet.nextElementSibling).toBe(laterSheet);
    laterSheet.remove();
  });

  it("should remove the styles on unmount", () => {
    const { unmount } = render(
      <GlobalStyleSheet styles="body { color-scheme: light; }" />,
    );
    unmount();

    expect(getSheets()).toHaveLength(0);
  });
});
