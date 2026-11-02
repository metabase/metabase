import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import { Modal, Select } from "metabase/ui";

function setup({ withinPortal = true } = {}) {
  const onClose = jest.fn<void, []>();

  render(
    <Modal.Root opened onClose={onClose}>
      <Modal.Overlay data-testid="modal-overlay" />
      <Modal.Content>
        <Modal.Title>Parent modal</Modal.Title>
        <Modal.Body>
          <Select
            label="Column"
            data={["Revenue"]}
            comboboxProps={{ keepMounted: true, withinPortal }}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>,
  );

  return {
    onClose,
    input: screen.getByRole("textbox", { name: "Column" }),
    option: screen.getByText("Revenue"),
    backdrop: screen.getByTestId("modal-overlay"),
  };
}

describe("Modal with a kept-mounted dropdown", () => {
  it("closes on Escape when the dropdown starts hidden (#83368)", async () => {
    const { onClose, option } = setup();
    expect(option).not.toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click when the dropdown starts hidden (#83368)", async () => {
    const { onClose, option, backdrop } = setup({ withinPortal: false });
    expect(option).not.toBeVisible();

    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses the dropdown before the modal on Escape (#83368)", async () => {
    const { onClose, input, option } = setup();
    await userEvent.click(input);
    expect(option).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(option).not.toBeVisible());
    expect(option).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses a reopened dropdown before the modal on backdrop clicks (#83368)", async () => {
    const { onClose, input, option, backdrop } = setup({ withinPortal: false });
    await userEvent.click(input);
    expect(option).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(option).not.toBeVisible());
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(input);
    expect(option).toBeVisible();

    await userEvent.click(backdrop);

    await waitFor(() => expect(option).not.toBeVisible());
    expect(option).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
