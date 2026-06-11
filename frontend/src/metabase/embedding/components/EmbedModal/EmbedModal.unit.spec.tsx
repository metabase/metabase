import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

import { EmbedModal } from "./EmbedModal";

jest.mock(
  "metabase/embedding/components/EmbedModal/StaticEmbedSetupPane",
  () => ({
    StaticEmbedSetupPane: () => <div data-testid="static-embed-setup-pane" />,
  }),
);

interface SetupOpts {
  isOpen?: boolean;
  onBack?: () => void;
}

const setup = ({ isOpen = true, onBack }: SetupOpts = {}) => {
  const onClose = jest.fn();

  renderWithProviders(
    <EmbedModal
      isOpen={isOpen}
      resource={createMockCard()}
      resourceType="question"
      resourceParameters={[]}
      onUpdateEnableEmbedding={jest.fn()}
      onUpdateEmbeddingParams={jest.fn()}
      onBack={onBack}
      onClose={onClose}
    />,
  );

  return { onClose };
};

describe("EmbedModal", () => {
  it("renders the static embedding modal when open", () => {
    setup();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Static embedding")).toBeInTheDocument();
    expect(screen.getByTestId("static-embed-setup-pane")).toBeInTheDocument();
  });

  it("does not render the modal when closed", () => {
    setup({ isOpen: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Static embedding")).not.toBeInTheDocument();
  });

  it("calls onClose when the header close icon is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByLabelText("close icon"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when the header title area is clicked", async () => {
    const onBack = jest.fn();
    setup({ onBack });

    await userEvent.click(screen.getByText("Static embedding"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
