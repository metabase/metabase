import React from "react";
import nock from "nock";
import { screen, waitFor } from "@testing-library/react";
import {
  createMockCard,
  createMockCollection,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import {
  createMockAppState,
  createMockEmbedState,
  createMockQueryBuilderState,
} from "metabase-types/store/mocks";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { EmbedOptions } from "metabase-types/store";
import AppBar from "./AppBar";

describe("AppBar", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  describe("full-app embedding", () => {
    beforeEach(async () => {
      const scope = nock(location.origin);
      setupCollectionsEndpoints(scope);
      mockEmbedding();
    });

    afterEach(() => {
      jest.clearAllMocks();
      nock.cleanAll();
      reStoreMockEmbedding();
    });

    describe("large screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
      });

      it("should be able to toggle side nav", async () => {
        renderAppBar({
          side_nav: true,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();

        screen.getByTestId("sidebar-toggle").click();
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        renderAppBar({
          side_nav: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        renderAppBar({
          side_nav: true,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        screen.getByTestId("sidebar-toggle").click();
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        renderAppBar({
          side_nav: false,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });
    });

    describe("small screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: true }));
      });

      it("should be able to toggle side nav", async () => {
        renderAppBar({
          side_nav: true,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();

        screen.getByTestId("sidebar-toggle").click();
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.getByTestId("main-logo")).toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        renderAppBar({
          side_nav: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });

      it("should always show side nav toggle icon when logo is hidden", async () => {
        renderAppBar({
          side_nav: true,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();

        screen.getByTestId("sidebar-toggle").click();
        expect(screen.queryByText(/Our analytics/)).not.toBeInTheDocument();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.getByTestId("sidebar-toggle")).toBeVisible();
      });

      it("should not show either logo or side nav toggle button at all", async () => {
        renderAppBar({
          side_nav: false,
          logo: false,
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });
    });
  });
});

function renderAppBar(embedOptions: Partial<EmbedOptions>) {
  renderWithProviders(<AppBar />, {
    withRouter: true,
    initialRouterPath: "/question/1",
    storeInitialState: {
      app: createMockAppState({ isNavbarOpen: false }),
      embed: createMockEmbedState(embedOptions),
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

function setupMock() {
  nock(location.origin)
    .get(`/api/collection/root`)
    .reply(
      200,
      createMockCollection({
        id: "root",
        name: "Our analytics",
      }),
    );
}

const windowSelf = window.self;
function mockEmbedding() {
  Object.defineProperty(window, "self", {
    value: {},
  });
}

function reStoreMockEmbedding() {
  Object.defineProperty(window, "self", {
    value: windowSelf,
  });
}
