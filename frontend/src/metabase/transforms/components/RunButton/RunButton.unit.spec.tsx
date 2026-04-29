import { setupGetTransformsSettingsEndpoint } from "__support__/server-mocks/transform";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { TransformsSettings } from "metabase-types/api";

import { RunButton } from "./RunButton";

function setup({
  transformsSettings = {},
}: {
  transformsSettings?: Partial<TransformsSettings>;
} = {}) {
  jest.useFakeTimers();
  setupGetTransformsSettingsEndpoint({
    enabled: true,
    is_locked: null,
    ...transformsSettings,
  });

  renderWithProviders(<RunButton id={1} run={null} onRun={jest.fn()} />);
}

describe("RunButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("when transforms are not locked", () => {
    it("renders an enabled run button and does not have a hover card", async () => {
      setup();

      await waitFor(() =>
        expect(screen.getByTestId("run-button")).toBeEnabled(),
      );

      fireEvent.mouseEnter(screen.getByTestId("run-button"));
      act(() => jest.runAllTimers());
      expect(
        screen.queryByTestId("locked-transforms-hover-card"),
      ).not.toBeInTheDocument();
    });
  });

  describe("when transforms are locked", () => {
    it("renders a disabled run button and shows an explanatory card on hover", async () => {
      setup({ transformsSettings: { is_locked: true } });

      await waitFor(() =>
        expect(screen.getByTestId("run-button")).toBeDisabled(),
      );

      fireEvent.mouseEnter(screen.getByTestId("run-button"));
      act(() => jest.runAllTimers());
      expect(
        screen.getByTestId("locked-transforms-hover-card"),
      ).toBeInTheDocument();
    });
  });
});
