import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type { State } from "metabase-types/store";
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
    const button = screen.getByLabelText("Add a filter");
    expect(button).toBeInTheDocument();
    expect(screen.getByLabelText("filter icon")).toBeInTheDocument();
  });

  it("should dispatch showAddParameterPopover when clicked and popover is closed", async () => {
    const { store } = setup();
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(false);
    const button = screen.getByLabelText("Add a filter");
    await userEvent.click(button);
    expect(screen.getByText("What do you want to filter?")).toBeInTheDocument();
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(true);
  });

  it("should dispatch hideAddParameterPopover when clicked and popover is open", async () => {
    const { store } = setup({ isAddParameterPopoverOpen: true });
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(true);
    const button = screen.getByLabelText("Add a filter");
    await userEvent.click(button);
    expect(
      screen.queryByText("What do you want to filter?"),
    ).not.toBeInTheDocument();
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(false);
  });

  it("should render ParametersPopover when isAddParameterPopoverOpen is true", () => {
    const { store } = setup({ isAddParameterPopoverOpen: true });
    expect(screen.getByText("What do you want to filter?")).toBeInTheDocument();
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(true);
  });

  it("should not render ParametersPopover when isAddParameterPopoverOpen is false", () => {
    const { store } = setup({ isAddParameterPopoverOpen: false });
    expect(
      screen.queryByText("What do you want to filter?"),
    ).not.toBeInTheDocument();
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(false);
  });

  it("should dispatch hideAddParameterPopover when popover is closed", async () => {
    const { store } = setup({ isAddParameterPopoverOpen: true });
    expect(screen.getByText("What do you want to filter?")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(getIsAddParameterPopoverOpen(store.getState())).toBe(false);
  });
});

function getIsAddParameterPopoverOpen(state: State) {
  return state.dashboard.isAddParameterPopoverOpen;
}
