import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Button, Group, Text } from "metabase/ui";
import { createMockState } from "metabase-types/store/mocks";

import { EmbedModal } from "./EmbedModal";

const TestEmbedModal = ({
  onClose,
  isOpen,
  initialEmbedType,
}: {
  onClose: () => void;
  isOpen?: boolean;
  initialEmbedType?: "legalese" | "application";
}): JSX.Element => {
  return (
    <EmbedModal
      isOpen={isOpen}
      onClose={onClose}
      initialEmbedType={initialEmbedType}
    >
      {({ embedType, goToNextStep, goBackToEmbedModal }) => (
        <Group data-testid="test-embed-modal-content">
          <Button onClick={goBackToEmbedModal}>Previous</Button>
          <Text data-testid="test-embed-step">
            {embedType ?? "Embed Landing"}
          </Text>
          <Button onClick={goToNextStep}>Next</Button>
        </Group>
      )}
    </EmbedModal>
  );
};

const setup = ({
  isOpen = true,
  showStaticEmbedTerms = true,
  initialEmbedType,
}: {
  isOpen?: boolean;
  showStaticEmbedTerms?: boolean;
  initialEmbedType?: "legalese" | "application";
} = {}) => {
  const onClose = jest.fn();

  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <TestEmbedModal
          isOpen={isOpen}
          onClose={onClose}
          initialEmbedType={initialEmbedType}
        />
      )}
    ></Route>,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "application-name": "Embed Metabase",
          "show-static-embed-terms": showStaticEmbedTerms,
        }),
      }),
      initialRoute: "*",
      withRouter: true,
    },
  );

  return { onClose };
};

describe("EmbedModal", () => {
  it("should render header and content", () => {
    setup();

    expect(
      within(screen.getByTestId("modal-header")).getByText("Embed Metabase"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("test-embed-modal-content")).toBeInTheDocument();

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "Embed Landing",
    );
  });

  it("should go to the legalese step when `Next` is clicked", async () => {
    setup();

    await userEvent.click(screen.getByText("Next"));

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent("legalese");
  });

  it("should go to the legalese step then the static embedding step if the user has not accepted the embedding terms", async () => {
    setup({ showStaticEmbedTerms: true });
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent("legalese");

    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );
  });

  it("should immediately go to the static embedding step if the user has accepted the terms", async () => {
    setup({ showStaticEmbedTerms: false });

    await userEvent.click(screen.getByText("Next"));
    expect(
      within(screen.getByTestId("modal-header")).getByText("Static embedding"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );
  });

  it("returns to the initial embed modal landing when the user clicks the modal title", async () => {
    setup();

    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent("legalese");

    await userEvent.click(screen.getByText("Static embedding"));
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "Embed Landing",
    );
  });

  it("calls onClose when the modal is closed", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByLabelText("close icon"));
    expect(onClose).toHaveBeenCalled();
  });

  it("should start at the application step when initialEmbedType is 'application'", () => {
    setup({ initialEmbedType: "application" });

    expect(
      within(screen.getByTestId("modal-header")).getByText("Static embedding"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );
  });

  it("should start at the legalese step when initialEmbedType is 'legalese'", () => {
    setup({ initialEmbedType: "legalese" });

    expect(
      within(screen.getByTestId("modal-header")).getByText("Static embedding"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent("legalese");
  });

  it("should skip the landing page when initialEmbedType is provided", () => {
    setup({ initialEmbedType: "application" });

    expect(screen.queryByText("Embed Metabase")).not.toBeInTheDocument();
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );
  });

  it("should allow going back to landing page from initialEmbedType step", async () => {
    setup({ initialEmbedType: "application" });

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );

    await userEvent.click(screen.getByText("Previous"));

    expect(
      within(screen.getByTestId("modal-header")).getByText("Embed Metabase"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "Embed Landing",
    );
  });

  it("should allow navigating forward from initialEmbedType legalese to application", async () => {
    setup({ initialEmbedType: "legalese" });

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent("legalese");

    await userEvent.click(screen.getByText("Next"));

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );
  });

  it("should reset to null embedType when closing modal with initialEmbedType", async () => {
    const { onClose } = setup({ initialEmbedType: "application" });

    expect(screen.getByTestId("test-embed-step")).toHaveTextContent(
      "application",
    );

    await userEvent.click(screen.getByLabelText("close icon"));

    expect(onClose).toHaveBeenCalled();
  });
});
