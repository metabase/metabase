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
});
