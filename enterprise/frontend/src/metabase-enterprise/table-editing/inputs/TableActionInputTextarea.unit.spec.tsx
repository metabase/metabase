import { render, screen } from "__support__/ui";

import { TableActionInputTextarea } from "./TableActionInputTextarea";

describe("TableActionInputTextarea", () => {
  it("applies separate wrapper and textarea classes", () => {
    render(
      <TableActionInputTextarea
        classNames={{
          textareaWrapper: "textarea-wrapper",
          textareaElement: "textarea-element",
        }}
      />,
    );

    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveClass("textarea-element");
    expect(textarea.parentElement).toHaveClass("textarea-wrapper");
  });
});
