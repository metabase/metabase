import React from "react";
import nock from "nock";
import { render, screen } from "@testing-library/react";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import { createMockEmbedState } from "metabase-types/store/mocks";
import AppBar from "./AppBar";

jest.mock("metabase/selectors/embed", () => {
  return {
    ...jest.requireActual("metabase/selectors/embed"),
    getIsEmbedded: jest.fn().mockReturnValue(true),
  };
});
jest.mock("metabase/selectors/app", () => {
  return {
    ...jest.requireActual("metabase/selectors/app"),
    getIsCollectionPathVisible: jest.fn().mockReturnValue(true),
  };
});

describe("AppBar", () => {
  const matchMediaSpy = jest.spyOn(window, "matchMedia");

  describe("full-app embedding", () => {
    beforeEach(async () => {
      setupMock();
    });

    afterEach(() => {
      jest.clearAllMocks();
      nock.cleanAll();
    });

    describe("large screens", () => {
      beforeEach(() => {
        matchMediaSpy.mockReturnValue(getMediaQuery({ matches: false }));
      });

      it("should be able to toggle side nav", async () => {
        // setupMock();
        renderWithProviders(<AppBar />, {
          withRouter: true,
          storeInitialState: {
            embed: createMockEmbedState({ side_nav: true }),
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

  const getMediaQuery = (opts?: Partial<MediaQueryList>): MediaQueryList => ({
    media: "",
    matches: false,
    onchange: jest.fn(),
    dispatchEvent: jest.fn(),
    addListener: jest.fn(),
    addEventListener: jest.fn(),
    removeListener: jest.fn(),
    removeEventListener: jest.fn(),
    ...opts,
  });
});

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
