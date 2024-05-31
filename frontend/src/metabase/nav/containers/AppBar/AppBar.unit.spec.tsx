import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import { DEFAULT_EMBED_OPTIONS } from "metabase/redux/embed";
import { createMockCard } from "metabase-types/api/mocks";
import type { EmbedOptions } from "metabase-types/store";
import {
  createMockAppState,
  createMockEmbedState,
  createMockQueryBuilderState,
} from "metabase-types/store/mocks";

import AppBar from "./AppBar";

describe("AppBar", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  describe("full-app embedding", () => {
    beforeEach(async () => {
      mockEmbedding();
    });

    afterEach(() => {
      jest.clearAllMocks();
      restoreMockEmbedding();
    });

    describe("large screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
      });

      it("should be able to toggle side nav", async () => {
        setup({
          side_nav: true,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        setup({
          side_nav: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        setup({
          side_nav: true,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        setup({
          side_nav: false,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should take you home when clicking the logo", async () => {
        const { history } = setup({});

        if (!history) {
          throw new Error("history should be available from test setup");
        }

        expect(history.getCurrentLocation().pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(history.getCurrentLocation().pathname).toBe("/");
      });
    });

    describe("small screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: true }));
      });

      it("should be able to toggle side nav", async () => {
        setup({
          side_nav: true,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        setup({
          side_nav: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        setup({
          side_nav: true,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        await userEvent.click(screen.getByTestId("sidebar-toggle"));
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        setup({
          side_nav: false,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should take you home when clicking the logo", async () => {
        const { history } = setup({});

        if (!history) {
          throw new Error("history should be available from test setup");
        }

        expect(history.getCurrentLocation().pathname).toBe("/question/1");
        await userEvent.click(screen.getByTestId("main-logo"));
        expect(history.getCurrentLocation().pathname).toBe("/");
      });
    });
  });
});

function setup(embedOptions: Partial<EmbedOptions>) {
  setupCollectionsEndpoints({ collections: [] });

  return renderWithProviders(<Route path="*" component={AppBar} />, {
    withRouter: true,
    initialRoute: "/question/1",
    storeInitialState: {
      app: createMockAppState({ isNavbarOpen: false }),
      embed: createMockEmbedState({
        ...DEFAULT_EMBED_OPTIONS,
        ...embedOptions,
      }),
      qb: createMockQueryBuilderState({
        card: createMockCard(),
      }),
    },
  });
}

function getMediaQuery(opts?: Partial<MediaQueryList>): MediaQueryList {
  return {
    media: "",
    matches: false,
    onchange: jest.fn(),
    dispatchEvent: jest.fn(),
    addListener: jest.fn(),
    addEventListener: jest.fn(),
    removeListener: jest.fn(),
    removeEventListener: jest.fn(),
    ...opts,
  };
}

const windowSelf = window.self;
function mockEmbedding() {
  Object.defineProperty(window, "self", {
    value: {},
  });
}

function restoreMockEmbedding() {
  Object.defineProperty(window, "self", {
    value: windowSelf,
  });
}
