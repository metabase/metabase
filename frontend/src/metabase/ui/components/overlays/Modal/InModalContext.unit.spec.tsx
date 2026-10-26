import { render, screen } from "__support__/ui";

import { InModalProvider, Modal, useIsInModal } from "./index";

function Probe() {
  return <div>{useIsInModal() ? "in modal" : "not in modal"}</div>;
}

describe("useIsInModal", () => {
  it("is false outside a modal", () => {
    render(<Probe />);

    expect(screen.getByText("not in modal")).toBeInTheDocument();
  });

  it("is true inside a Modal", () => {
    render(
      <Modal opened title="Title" onClose={jest.fn()}>
        <Probe />
      </Modal>,
    );

    expect(screen.getByText("in modal")).toBeInTheDocument();
  });

  it("is true inside a Modal.Root", () => {
    render(
      <Modal.Root opened onClose={jest.fn()}>
        <Modal.Content>
          <Modal.Body>
            <Probe />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>,
    );

    expect(screen.getByText("in modal")).toBeInTheDocument();
  });

  it("can be overridden inside a modal", () => {
    render(
      <Modal opened title="Title" onClose={jest.fn()}>
        <InModalProvider value={false}>
          <Probe />
        </InModalProvider>
      </Modal>,
    );

    expect(screen.getByText("not in modal")).toBeInTheDocument();
  });
});
