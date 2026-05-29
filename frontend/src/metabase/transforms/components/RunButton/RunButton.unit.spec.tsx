import { mockSettings } from "__support__/settings";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";

import { RunButton } from "./RunButton";

function setup({
  isMeterLocked = null,
}: {
  isMeterLocked?: boolean | null;
} = {}) {
  jest.useFakeTimers();
  const state = createMockState({
    settings: mockSettings({ "transforms-meter-locked": isMeterLocked }),
  });
  renderWithProviders(<RunButton id={1} run={null} onRun={jest.fn()} />, {
    storeInitialState: state,
  });
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
});
