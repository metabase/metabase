import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockOptions, setup } from "./test-utils";

jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual("@dnd-kit/core");
  return {
    ...actual,
    DndContext: ({ onDragEnd, children }: any) => (
      <div>
        {children}
        <button
          data-testid="simulate-dnd"
          onClick={() =>
            onDragEnd({ active: { id: "title" }, over: { id: "owner" } })
          }
        />
      </div>
    ),
  };
});

describe("ReorderableTagsInput", () => {
  describe("Basic functionality", () => {
    it("should render with placeholder when no values selected", () => {
      setup({ placeholder: "Select items" });
      expect(screen.getByPlaceholderText("Select items")).toBeInTheDocument();
    });

    it("should render selected values as pills", () => {
      setup({
        value: ["title", "status"],
      });

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("should open dropdown when clicking on input", async () => {
      const user = userEvent.setup();
      setup();

      const input = screen.getByPlaceholderText("Select options");
      await user.click(input);

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Subtitle")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("should call onChange when selecting an option", async () => {
      const user = userEvent.setup();
      const { onChange } = setup();

      const input = screen.getByPlaceholderText("Select options");
      await user.click(input);

      const titleOption = screen.getByRole("option", { name: "Title" });
      await user.click(titleOption);

      expect(onChange).toHaveBeenCalledWith(["title"]);
    });

    it("should not show selected options in dropdown", async () => {
      const user = userEvent.setup();
      setup({
        value: ["title"],
      });

      const input = screen.getByDisplayValue("");
      await user.click(input);

      expect(
        screen.queryByRole("option", { name: "Title" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Subtitle" }),
      ).toBeInTheDocument();
    });
  });

  describe("Pill removal", () => {
    it("should render pills with remove buttons", async () => {
      const user = userEvent.setup();
      const { onChange } = setup({
        value: ["title", "status"],
      });

      // Verify pills are rendered
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();

      // Get the pill element by its accessible role and label
      const titlePill = screen.getByRole("button", { name: "Title" });

      // Mantine CloseButton is aria-hidden, include hidden to find it
      const removeBtn = within(titlePill).getByRole("button", { hidden: true });

      // Click remove and assert onChange is fired with remaining values
      await user.click(removeBtn);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(["status"]);
      });
    });

    it("should remove last pill when pressing backspace on empty input", async () => {
      const user = userEvent.setup();
      const { onChange } = setup({
        value: ["title", "status"],
      });

      const input = screen.getByDisplayValue("");
      await user.click(input);
      await user.keyboard("{Backspace}");

      expect(onChange).toHaveBeenCalledWith(["title"]);
    });

    it("should not remove pill when backspace pressed with text in input", async () => {
      const user = userEvent.setup();
      const { onChange } = setup({
        value: ["title"],
      });

      const input = screen.getByDisplayValue("");
      await user.click(input);
      await user.type(input, "test");
      await user.keyboard("{Backspace}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("Search functionality", () => {
    it("should filter options based on search input", async () => {
      const user = userEvent.setup();
      setup();

      const input = screen.getByPlaceholderText("Select options");
      await user.click(input);
      await user.type(input, "tit");

      expect(screen.getByRole("option", { name: "Title" })).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Status" }),
      ).not.toBeInTheDocument();
    });

    it("should show 'Nothing found' when no options match search", async () => {
      const user = userEvent.setup();
      setup();

      const input = screen.getByPlaceholderText("Select options");
      await user.click(input);
      await user.type(input, "xyz");

      expect(screen.getByText("Nothing found")).toBeInTheDocument();
    });

    it("should clear search when selecting an option", async () => {
      const user = userEvent.setup();
      setup();

      const input = screen.getByPlaceholderText("Select options");
      await user.click(input);
      await user.type(input, "tit");

      const titleOption = screen.getByRole("option", { name: "Title" });
      await user.click(titleOption);

      expect(input).toHaveValue("");
    });
  });

  describe("Max values", () => {
    it("should not allow selecting more than maxValues", () => {
      const { onChange } = setup({
        maxValues: 2,
        value: ["title", "status"],
      });

      // At max capacity, there should be no input field and no dropdown
      expect(screen.queryByDisplayValue("")).not.toBeInTheDocument();
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should hide input field when maxValues reached", () => {
      setup({
        maxValues: 2,
        value: ["title", "status"],
      });

      expect(screen.queryByDisplayValue("")).not.toBeInTheDocument();
    });

    it("should not open dropdown when clicking on input at max capacity", async () => {
      const user = userEvent.setup();
      setup({
        maxValues: 2,
        value: ["title", "status"],
      });

      // Try to click where input would be, but it's hidden at max capacity
      const titlePill = screen.getByText("Title");
      await user.click(titlePill);

      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });

    it("should close dropdown when reaching maxValues - 1", async () => {
      const user = userEvent.setup();
      setup({
        maxValues: 2,
        value: ["title"],
      });

      const input = screen.getByDisplayValue("");
      await user.click(input);

      const statusOption = screen.getByRole("option", { name: "Status" });
      await user.click(statusOption);

      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });
  });

  describe("Reordering within input", () => {
    it("should reorder pills when dragging one over another", async () => {
      const { onChange } = setup({ value: ["title", "status", "owner"] });

      // sanity check
      expect(screen.getByText("Title")).toBeInTheDocument();

      // trigger mocked onDragEnd via custom DndContext wrapper
      fireEvent.click(screen.getByTestId("simulate-dnd"));

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(["status", "owner", "title"]);
      });
    });
  });

  describe("External DnD mode", () => {
    it("should render with external DnD props", () => {
      setup({
        useExternalDnd: true,
        containerId: "test-container",
        draggedItemId: "title",
        currentDroppable: "other-container",
        value: ["title", "status"],
      });

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("should hide dragged item when dragging to different container", () => {
      setup({
        useExternalDnd: true,
        containerId: "container-1",
        draggedItemId: "title",
        currentDroppable: "container-2",
        value: ["title", "status"],
      });

      // Title should be hidden, Status should be visible
      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("should show dragged item when dragging within same container", () => {
      setup({
        useExternalDnd: true,
        containerId: "container-1",
        draggedItemId: "title",
        currentDroppable: "container-1",
        value: ["title", "status"],
      });

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty data array", () => {
      setup({ data: [] });

      expect(screen.getByPlaceholderText("Select options")).toBeInTheDocument();
    });

    it("should handle value with items not in data", () => {
      setup({
        value: ["nonexistent"],
        data: mockOptions,
      });

      expect(screen.getByText("nonexistent")).toBeInTheDocument();
    });

    it("should not add duplicate values", async () => {
      const user = userEvent.setup();
      const { onChange } = setup({
        value: ["title"],
      });

      const input = screen.getByDisplayValue("");
      await user.click(input);

      // Title should not be in dropdown since it's already selected
      expect(
        screen.queryByRole("option", { name: "Title" }),
      ).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalledWith(["title", "title"]);
    });
  });
});
