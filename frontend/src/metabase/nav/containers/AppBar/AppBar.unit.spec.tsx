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
      reStoreMockEmbedding();
      nock.cleanAll();
    });

    describe("large screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
      });

      it("should be able to toggle side nav", async () => {
        const embedOptions: Partial<EmbedOptions> = {
          side_nav: true,
        };
        renderWithProviders(<AppBar />, {
          withRouter: true,
          initialPath: "/question/1",
          storeInitialState: {
            app: createMockAppState({ isNavbarOpen: false }),
            embed: createMockEmbedState(embedOptions),
            qb: createMockQueryBuilderState({
              card: createMockCard(),
            }),
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        screen.getByTestId("sidebar-toggle").click();
        expect(screen.getByText(/Our analytics/)).not.toBeVisible();
      });

      it("should hide side nav toggle icon", async () => {
        const embedOptions: Partial<EmbedOptions> = {
          side_nav: false,
        };
        renderWithProviders(<AppBar />, {
          withRouter: true,
          initialPath: "/question/1",
          storeInitialState: {
            app: createMockAppState({ isNavbarOpen: false }),
            embed: createMockEmbedState(embedOptions),
            qb: createMockQueryBuilderState({
              card: createMockCard(),
            }),
          },
        });

        expect(await screen.findByText(/Our analytics/)).toBeVisible();
        expect(screen.getByTestId("main-logo")).toBeVisible();
        expect(screen.queryByTestId("sidebar-toggle")).not.toBeInTheDocument();
      });
    });
  });
});

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
