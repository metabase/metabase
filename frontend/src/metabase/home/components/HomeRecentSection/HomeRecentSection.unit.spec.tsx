import React from "react";
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import { createMockRecentItem, createMockUser } from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import { setupRecentViewsEndpoints } from "__support__/server-mocks";
import { User } from "metabase-types/api";
import * as utils from "../../utils";
import { HomeRecentSection } from "./HomeRecentSection";

jest.mock("../../utils", () => ({
  isWithinWeeks: jest.fn(),
}));

const setup = async (user?: User) => {
  setupRecentViewsEndpoints([
    createMockRecentItem({
      model: "table",
      model_object: {
        name: "Orders",
      },
    }),
  ]);

  renderWithProviders(<HomeRecentSection />, {
    storeInitialState: {
      currentUser: user,
    },
  });

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
};

describe("HomeRecentSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("new installers", () => {
    it("should show a help link for new installers", async () => {
      jest.spyOn(utils, "isWithinWeeks").mockImplementationOnce(() => true);

      await setup(
        createMockUser({
          is_installer: true,
          first_login: "2020-01-05T00:00:00Z",
        }),
      );

      expect(await screen.findByText("Metabase tips")).toBeInTheDocument();
    });

    it("should not show a help link for regular users", async () => {
      jest.spyOn(utils, "isWithinWeeks").mockImplementationOnce(() => false);

      await setup();

      expect(screen.queryByText("Metabase tips")).not.toBeInTheDocument();
    });
  });

  it("should render a list of recent items", async () => {
    await setup();

    expect(
      await screen.findByText("Pick up where you left off"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });
});
