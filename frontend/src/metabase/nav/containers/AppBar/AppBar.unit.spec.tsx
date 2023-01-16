import React from "react";
import nock from "nock";
import { screen } from "@testing-library/react";
import {
  createMockCard,
  createMockCollection,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import {
  createMockEmbedState,
  createMockQueryBuilderState,
} from "metabase-types/store/mocks";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
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
        renderWithProviders(<AppBar />, {
          withRouter: true,
          initialPath: "/question/1",
          storeInitialState: {
            embed: createMockEmbedState({ side_nav: true }),
            qb: createMockQueryBuilderState({
              card: createMockCard(),
            }),
          },
        });

        expect(
          screen.getByRole("button", { name: "sidebar-toggle" }),
        ).toBeInTheDocument();
        expect(await screen.findByText(/Our analytics/)).toBeInTheDocument();
        expect(screen.getByTestId("main-logo")).toBeInTheDocument();
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
