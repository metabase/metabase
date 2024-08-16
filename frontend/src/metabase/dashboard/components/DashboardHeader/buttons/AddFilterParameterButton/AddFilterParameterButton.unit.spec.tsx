import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { AddFilterParameterButton } from "./AddFilterParameterButton";

const setup = ({ isAddParameterPopoverOpen = false } = {}) => {
  const state = createMockState({
    dashboard: createMockDashboardState({
      isAddParameterPopoverOpen,
    }),
  });

  return renderWithProviders(<AddFilterParameterButton />, {
    storeInitialState: state,
  });
};

describe("AddFilterParameterButton", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should render the button with correct icon and tooltip", () => {
    setup();
    const button = screen.getByLabelText("Add a filter or parameter");
    expect(button).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
  });

  describe("when popover is open based on state", () => {
    it("should render the popover when isAddParameterPopoverOpen is true", () => {
      setup({ isAddParameterPopoverOpen: true });
      expect(
        screen.getByTestId("add-filter-parameter-dropdown"),
      ).toBeInTheDocument();
    });
    it("should not render the popover when isAddParameterPopoverOpen is false", () => {
      setup({ isAddParameterPopoverOpen: false });
      expect(
        screen.queryByTestId("add-filter-parameter-dropdown"),
      ).not.toBeInTheDocument();
    });
  });

  describe("when the popover is closed", () => {
    it("should show the popover when the button is clicked", async () => {
      setup();
      expect(
        screen.queryByTestId("add-filter-parameter-dropdown"),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByLabelText("Add a filter or parameter"));
      expect(
        screen.getByTestId("add-filter-parameter-dropdown"),
      ).toBeInTheDocument();
    });
  });

  describe("when the popover is open", () => {
    it("should close the popover when the button is clicked", async () => {
      setup({ isAddParameterPopoverOpen: true });
      expect(
        screen.getByTestId("add-filter-parameter-dropdown"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByLabelText("Add a filter or parameter"));
      expect(
        screen.queryByTestId("add-filter-parameter-dropdown"),
      ).not.toBeInTheDocument();
    });

    it("should close the popover when the user clicks outside the popover (metabase#46765)", async () => {
      setup({ isAddParameterPopoverOpen: true });
      expect(
        screen.getByTestId("add-filter-parameter-dropdown"),
      ).toBeInTheDocument();
      await userEvent.click(document.body);
      expect(
        screen.queryByTestId("add-filter-parameter-dropdown"),
      ).not.toBeInTheDocument();
    });
  });

  it("should show the popover when the button is clicked", async () => {
    setup();

    const button = screen.getByLabelText("Add a filter or parameter");
    await userEvent.click(button);
    expect(screen.getByText("Add a filter or parameter")).toBeInTheDocument();
  });
});
