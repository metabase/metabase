import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockNativeQuerySnippet } from "metabase-types/api/mocks";

import { SnippetDescriptionSection } from "./SnippetDescriptionSection";

type SetupProps = {
  description: string;
  isDisabled?: boolean;
};

const setup = ({ description, isDisabled }: SetupProps) => {
  const snippet = createMockNativeQuerySnippet({ description });
  renderWithProviders(
    <SnippetDescriptionSection isDisabled={isDisabled} snippet={snippet} />,
  );
};

describe("SnippetDescriptionSection", () => {
  it("renders editable text with snippet description", async () => {
    setup({ description: "My snippet description" });

    expect(screen.getByTestId("editable-text")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("editable-text"));

    expect(screen.getByPlaceholderText("No description")).toBeEnabled();
    expect(screen.getByPlaceholderText("No description")).toHaveValue(
      "My snippet description",
    );
  });

  it("renders a disabled input when isDisabled is true", async () => {
    setup({ description: "My snippet description", isDisabled: true });

    expect(screen.getByTestId("editable-text")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("editable-text"));

    expect(screen.getByPlaceholderText("No description")).toBeDisabled();
  });

  it("renders the description as markdown", () => {
    setup({ description: "**Bold text** and *italic text*" });

    expect(screen.getByText("Bold text").tagName).toBe("STRONG");
    expect(screen.getByText("italic text").tagName).toBe("EM");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("keeps focus and inserts new line when Enter is pressed", async () => {
    setup({ description: "" });

    await userEvent.click(screen.getByTestId("editable-text"));
    const input = screen.getByPlaceholderText("No description");
    await userEvent.type(input, "# Heading{Enter}second line");

    expect(input).toHaveFocus();
    expect(input).toHaveValue("# Heading\nsecond line");
  });
});
