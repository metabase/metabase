import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { FilterSubmitButton } from "./FilterSubmitButton";

type SetupOpts = {
  isNew?: boolean;
  isDisabled?: boolean;
  withAddButton?: boolean;
};

function setup({ isNew, isDisabled, withAddButton }: SetupOpts = {}) {
  const onAddButtonClick = jest.fn();

  renderWithProviders(
    <FilterSubmitButton
      isNew={isNew}
      isDisabled={isDisabled}
      withAddButton={withAddButton}
      onAddButtonClick={onAddButtonClick}
    />,
  );

  return { onAddButtonClick };
}

describe("FilterSubmitButton", () => {
  describe("without add button", () => {
    it('should render the "Add filter" label for new filters', () => {
      setup({ isNew: true });
      expect(
        screen.getByRole("button", { name: "Add filter" }),
      ).toBeInTheDocument();
    });

    it('should render the "Update filter" label for existing filters', () => {
      setup({ isNew: false });
      expect(
        screen.getByRole("button", { name: "Update filter" }),
      ).toBeInTheDocument();
    });

    it("should disable the button when the option is passed", () => {
      setup({ isNew: true, isDisabled: true });
      expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();
    });

    it("should not render the add button", () => {
      setup();
      expect(
        screen.queryByRole("button", { name: "Add another filter" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("with add button", () => {
    it.each([{ isNew: false }, { isNew: true }])(
      'should render the "Apply filter" label for new and existing filters',
      ({ isNew }) => {
        setup({ isNew, withAddButton: true });
        expect(
          screen.getByRole("button", { name: "Apply filter" }),
        ).toBeInTheDocument();
      },
    );

    it("should render the add button", () => {
      setup({ withAddButton: true });
      expect(
        screen.getByRole("button", { name: "Add another filter" }),
      ).toBeInTheDocument();
    });

    it("should call the callback only when the add button is clicked", async () => {
      const { onAddButtonClick } = setup({ withAddButton: true });
      await userEvent.click(
        screen.getByRole("button", { name: "Apply filter" }),
      );
      expect(onAddButtonClick).not.toHaveBeenCalled();

      await userEvent.click(
        screen.getByRole("button", { name: "Add another filter" }),
      );
      expect(onAddButtonClick).toHaveBeenCalled();
    });

    it("should disable both buttons when the option is passed", () => {
      setup({ isDisabled: true, withAddButton: true });
      expect(
        screen.getByRole("button", { name: "Apply filter" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Add another filter" }),
      ).toBeDisabled();
    });
  });
});
