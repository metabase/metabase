import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ColumnItemProps } from "./ColumnItem";
import { ColumnItem } from "./ColumnItem";

interface SetupProps extends Partial<ColumnItemProps> {}

const setup = (props?: SetupProps) => {
  const onClick = jest.fn();
  const onAdd = jest.fn();
  const onRemove = jest.fn();
  const onEdit = jest.fn();
  const onEnable = jest.fn();
  const onColorChange = jest.fn();

  render(
    <ColumnItem
      title="Column Title"
      onClick={onClick}
      onAdd={onAdd}
      onRemove={onRemove}
      onEdit={onEdit}
      onEnable={onEnable}
      onColorChange={onColorChange}
      className={props?.className}
      color={props?.color}
      role={props?.role}
      draggable={props?.draggable}
      icon={props?.icon}
      removeIcon={props?.removeIcon}
      accentColorOptions={props?.accentColorOptions}
    />,
  );

  return {
    onClick,
    onAdd,
    onRemove,
    onEdit,
    onEnable,
    onColorChange,
  };
};

describe("ColumnItem", () => {
  describe("click handlers", () => {
    it("should call onClick when clicking the item", async () => {
      const { onClick } = setup();

      const item = screen.getByText("Column Title");
      await userEvent.click(item);

      expect(onClick).toHaveBeenCalled();
    });

    it("should call onAdd when add button is clicked", async () => {
      const { onAdd } = setup();

      const addButton = screen.getByTestId("Column Title-add-button");
      await userEvent.click(addButton);

      expect(onAdd).toHaveBeenCalled();
      expect(onAdd).toHaveBeenCalledWith(expect.any(HTMLElement));
    });

    it("should call onRemove when hide button is clicked", async () => {
      const { onRemove } = setup();

      const hideButton = screen.getByTestId("Column Title-hide-button");
      await userEvent.click(hideButton);

      expect(onRemove).toHaveBeenCalled();
      expect(onRemove).toHaveBeenCalledWith(expect.any(HTMLElement));
    });

    it("should call onEdit when settings button is clicked", async () => {
      const { onEdit } = setup();

      const settingsButton = screen.getByTestId("Column Title-settings-button");
      await userEvent.click(settingsButton);

      expect(onEdit).toHaveBeenCalled();
      expect(onEdit).toHaveBeenCalledWith(expect.any(HTMLElement));
    });

    it("should call onEnable when show button is clicked", async () => {
      const { onEnable } = setup();

      const showButton = screen.getByTestId("Column Title-show-button");
      await userEvent.click(showButton);

      expect(onEnable).toHaveBeenCalled();
      expect(onEnable).toHaveBeenCalledWith(expect.any(HTMLElement));
    });
  });

  describe("draggable functionality", () => {
    it("should render with draggable attributes when draggable is true", () => {
      setup({ draggable: true });

      const draggableItem = screen.getByTestId("draggable-item-Column Title");
      expect(draggableItem).toBeInTheDocument();
    });
  });
});
