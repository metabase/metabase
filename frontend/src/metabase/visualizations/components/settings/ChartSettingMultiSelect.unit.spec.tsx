import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import { Modal } from "metabase/ui";

import { ChartSettingMultiSelect } from "./ChartSettingMultiSelect";

const setup = () => {
  const onClose = jest.fn<void, []>();
  const onChange = jest.fn<void, [string[] | undefined]>();

  render(
    <Modal.Root opened onClose={onClose}>
      <Modal.Overlay data-testid="modal-overlay" />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Visualization options</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <ChartSettingMultiSelect
            value={[]}
            onChange={onChange}
            options={[
              { value: "discount", label: "Discount" },
              { value: "quantity", label: "Quantity" },
            ]}
            placeholder="Enter column names"
            placeholderNoOptions="No columns available"
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>,
  );

  return { onClose, onChange };
};

describe("ChartSettingMultiSelect", () => {
  describe.each([
    {
      name: "Escape",
      dismiss: () => userEvent.keyboard("{Escape}"),
    },
    {
      name: "a backdrop click",
      dismiss: () => userEvent.click(screen.getByTestId("modal-overlay")),
    },
  ])("modal dismissal with $name", ({ dismiss }) => {
    it("should close the modal when the dropdown has not been opened (#83368)", async () => {
      const { onClose } = setup();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      await dismiss();

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should dismiss an open dropdown before closing the modal after a selection (#83368)", async () => {
      const { onClose, onChange } = setup();
      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByRole("option", { name: "Discount" }));
      expect(onChange).toHaveBeenCalledWith(["discount"]);
      expect(screen.getByRole("listbox")).toBeVisible();

      await dismiss();

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      await dismiss();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
