import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen, waitFor } from "__support__/ui";

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

  it("should become editable when a key is pressed", async () => {
    setup({
      initialValue: "original description",
      isMarkdown: true,
    });
    const description = await screen.findByTestId("editable-text");
    description.focus();
    fireEvent.keyDown(description, { key: "b" });
    const textarea = await screen.findByRole("textbox");
    expect(textarea).toHaveFocus();
  });

  it("should become editable when enter key is pressed, without a line break being added to the description", async () => {
    setup({
      initialValue: "original description",
      isMarkdown: true,
    });

    const description = await screen.findByTestId("editable-text");
    description.focus();
    fireEvent.keyUp(description, { key: "Enter" });
    const textarea = await screen.findByRole("textbox");
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveTextContent(/^original description$/);
  });
});
