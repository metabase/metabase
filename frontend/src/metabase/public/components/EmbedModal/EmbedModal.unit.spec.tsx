import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import { Button, Group, Text } from "metabase/ui";
import { EmbedModal } from "./EmbedModal";

const TestEmbedModal = ({
  onClose,
  isOpen,
}: {
  onClose: () => void;
  isOpen?: boolean;
}): JSX.Element => {
  return (
    <EmbedModal isOpen={isOpen} onClose={onClose}>
      {({ embedType, goToNextStep, goBackToEmbedModal }) => (
        <Group data-testid="test-embed-modal-content">
          <Button onClick={goBackToEmbedModal}>Previous</Button>
          <Text>{embedType ?? "Embed Landing"}</Text>
          <Button onClick={goToNextStep}>Next</Button>
        </Group>
      )}
    </EmbedModal>
  );
};

const setup = ({ isOpen = true } = {}) => {
  const onClose = jest.fn();

  renderWithProviders(
    <Route
      path="*"
      component={() => <TestEmbedModal isOpen={isOpen} onClose={onClose} />}
    ></Route>,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "application-name": "Embed Metabase",
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

    expect(screen.getByText("Embed Landing")).toBeInTheDocument();
  });

  it("should go to the legalese step when `Next` is clicked", () => {
    setup();

    userEvent.click(screen.getByText("Next"));

    expect(screen.getByText("legalese")).toBeInTheDocument();
  });

  it("should go to the static embedding step when `Next` is clicked twice", async () => {
    // TODO: add logic for this test when we add the API call
    //  for checking if the user has already accepted the terms

    setup();

    userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("legalese")).toBeInTheDocument();

    userEvent.click(screen.getByText("Next"));
    expect(
      within(screen.getByTestId("modal-header")).getByText("Static embedding"),
    ).toBeInTheDocument();
    expect(screen.getByText("application")).toBeInTheDocument();
  });

  it("returns to the initial embed modal landing when the user clicks the modal title", () => {
    setup();

    userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("legalese")).toBeInTheDocument();

    userEvent.click(screen.getByText("Static embedding"));
    expect(screen.getByText("Embed Landing")).toBeInTheDocument();
  });

  it("calls onClose when the modal is closed", () => {
    const { onClose } = setup();
    userEvent.click(screen.getByLabelText("close icon"));
    expect(onClose).toHaveBeenCalled();
  });
});
