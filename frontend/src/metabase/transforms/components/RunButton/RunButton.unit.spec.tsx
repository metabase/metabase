import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { mockSettings } from "__support__/settings";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Menu } from "metabase/ui";
import type { TransformRun } from "metabase-types/api";
import { createMockTransformRun } from "metabase-types/api/mocks";

import { RunButton } from "./RunButton";

function setup({
  isMeterLocked = null,
  run = null,
  menuItems,
  onRun = jest.fn(),
}: {
  isMeterLocked?: boolean | null;
  run?: TransformRun | null;
  menuItems?: ReactNode;
  onRun?: () => void;
} = {}) {
  jest.useFakeTimers();
  const state = createMockState({
    settings: mockSettings({ "transforms-meter-locked": isMeterLocked }),
  });
  renderWithProviders(
    <RunButton id={1} run={run} onRun={onRun} menuItems={menuItems} />,
    {
      storeInitialState: state,
    },
  );
  return { onRun };
}

describe("RunButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("when transforms are not locked", () => {
    it("renders an enabled run button and does not have a hover card", async () => {
      setup();

      expect(screen.getByTestId("run-button")).toBeEnabled();

      fireEvent.mouseEnter(screen.getByTestId("run-button"));
      act(() => jest.runAllTimers());
      expect(
        screen.queryByTestId("locked-transforms-hover-card"),
      ).not.toBeInTheDocument();
    });
  });

  describe("when transforms are locked", () => {
    it("renders a disabled run button and shows an explanatory card on hover", async () => {
      setup({ isMeterLocked: true });

      expect(screen.getByTestId("run-button")).toBeDisabled();

      fireEvent.mouseEnter(screen.getByTestId("run-button"));
      act(() => jest.runAllTimers());
      expect(
        screen.getByTestId("locked-transforms-hover-card"),
      ).toBeInTheDocument();
    });
  });

  describe("menuItems split button", () => {
    it("does not render the options toggle when no menuItems are passed", () => {
      setup();
      expect(
        screen.queryByTestId("run-options-button"),
      ).not.toBeInTheDocument();
    });

    it("opens the menu items when the options toggle is clicked", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      setup({
        menuItems: <Menu.Item>{"Run with upstream"}</Menu.Item>,
      });

      await user.click(screen.getByTestId("run-options-button"));
      expect(await screen.findByText("Run with upstream")).toBeInTheDocument();
    });

    it("hides the options toggle while a run is in progress", () => {
      setup({
        run: createMockTransformRun({ status: "started" }),
        menuItems: <Menu.Item>{"Run with upstream"}</Menu.Item>,
      });
      expect(
        screen.queryByTestId("run-options-button"),
      ).not.toBeInTheDocument();
    });
  });
});
