import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import { Button, Group, Text } from "metabase/ui";
import { EmbedModal } from "./EmbedModal";

// We need to mock the Modal here because there's an issue with the RoutelessFullPageModal
// component, which can't find the routing.locationBeforeTransitions prop when it's rendered with this test.
// We'll just take the props that the Modal is using and render them so we know what the component is
// working with, and then we can refactor this test later using the Mantine Modal when all inner
// components are refactored to use Mantine.
jest.mock("metabase/components/Modal", () => {
  const Modal = ({
    children,
    title,
    isOpen,
    onClose,
    full,
  }: {
    children: JSX.Element;
    title: JSX.Element;
    isOpen: boolean;
    onClose: () => void;
    full: boolean;
  }) => {
    return (
      isOpen && (
        <div data-is-fullscreen={full}>
          <div onClick={onClose} data-testid="close-modal-button">
            close
          </div>
          <div data-testid="modal-header">{title}</div>
          {children}
        </div>
      )
    );
  };
  return Modal;
});

const TestEmbedModal = ({
  onClose,
  isOpen,
}: {
  onClose: () => void;
  isOpen?: boolean;
}): JSX.Element => {
  return (
    <EmbedModal isOpen={isOpen} onClose={onClose}>
      {({ embedType, goToNextStep, goToPreviousStep }) => (
        <Group data-testid="test-embed-modal-content">
          <Button onClick={goToPreviousStep}>Previous</Button>
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
    userEvent.click(screen.getByTestId("close-modal-button"));
    expect(onClose).toHaveBeenCalled();
  });
});
