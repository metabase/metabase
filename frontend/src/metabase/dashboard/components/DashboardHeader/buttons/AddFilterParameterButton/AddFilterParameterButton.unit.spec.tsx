import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, within } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { AddFilterParameterButton } from "./AddFilterParameterButton";

const SECTIONS = [
  {
    title: "Date picker",
    subtitle: "Date range, specific date…",
    icon: "calendar",
  },
  {
    title: "Time grouping",
    subtitle: "Day, week, month, year…",
    icon: "clock",
  },
  {
    title: "Location",
    subtitle: "Country, State, Postal Code…",
    icon: "location",
  },
  {
    title: "Text or Category",
    subtitle: "Contains, is, starts with…",
    icon: "string",
  },
  {
    title: "Number",
    subtitle: "Between, greater than…",
    icon: "number",
  },
  {
    title: "ID",
    subtitle: "Primary key, User ID…",
    icon: "label",
  },
];

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

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByText("Add a filter or parameter"),
    ).toBeInTheDocument();
  });

  it.each(SECTIONS)(
    "should render '$title' menu item with icon '$icon'",
    async ({ title, subtitle, icon }) => {
      setup();

      await userEvent.click(screen.getByLabelText("Add a filter or parameter"));
      const section = await screen.findByLabelText(title);
      expect(within(section).getByText(title)).toBeInTheDocument();
      expect(within(section).getByText(subtitle)).toBeInTheDocument();
      expect(
        within(section).getByLabelText(`${icon} icon`),
      ).toBeInTheDocument();
    },
  );
});
