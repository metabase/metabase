import userEvent from "@testing-library/user-event";

import { screen, render, waitFor } from "__support__/ui";

import type { EditableTextProps } from "./EditableText";
import EditableText from "./EditableText";

const setup = (props?: Partial<EditableTextProps>) => {
  render(<EditableText {...props} />);
};

describe("EditableText", () => {
  describe("when there is no initial value", () => {
    it("should render input", () => {
      setup();

      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  it("should render markdown, not input", () => {
    setup({
      initialValue: "Description",
      isMarkdown: true,
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("should render input after a click", async () => {
    setup({
      initialValue: "Description",
      isMarkdown: true,
    });

    await userEvent.click(screen.getByText("Description"));

    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should focus the input", async () => {
    setup({
      initialValue: "Description",
      isMarkdown: true,
    });

    await userEvent.click(screen.getByText("Description"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  it("should render markdown on blur", async () => {
    setup({
      initialValue: "**bold** [link](https://metabase.com)",
      isMarkdown: true,
    });

    await userEvent.click(screen.getByTestId("editable-text"));

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveFocus();
    });

    await userEvent.tab();

    expect(screen.getByTestId("editable-text")).toHaveTextContent("bold link");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should not render input if click happened on the link", async () => {
    setup({
      initialValue: "**bold** [link](https://metabase.com)",
      isMarkdown: true,
    });

    await userEvent.click(screen.getByRole("link"));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("editable-text")).toHaveTextContent("bold link");
  });
});
