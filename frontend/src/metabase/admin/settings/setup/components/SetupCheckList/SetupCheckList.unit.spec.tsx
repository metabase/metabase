import React from "react";
import { SetupCheckListItem } from "metabase-types/api";
import {
  createMockSetupCheckListItem,
  createMockSetupCheckListTask,
} from "metabase-types/api/mocks";
import { setupAdminCheckListEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import SetupCheckList from "./SetupCheckList";

const TEST_H2_LINK =
  "https://metabase.test//docs/latest/installation-and-operation/migrating-from-h2";

const TEST_ITEMS = [
  createMockSetupCheckListItem({
    name: "Get connected",
    tasks: [
      createMockSetupCheckListTask({
        title: "Add a database",
        group: "Get connected",
        link: "/admin/databases/create",
      }),
    ],
  }),
  createMockSetupCheckListItem({
    name: "Productionize",
    tasks: [
      createMockSetupCheckListTask({
        title: "Switch to a production-ready app database",
        group: "Productionize",
        link: TEST_H2_LINK,
      }),
    ],
  }),
];

interface SetupOpts {
  items?: SetupCheckListItem[];
}

const setup = async ({ items = TEST_ITEMS }: SetupOpts = {}) => {
  setupAdminCheckListEndpoint(items);
  renderWithProviders(<SetupCheckList />);
  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
};

describe("SetupCheckList", () => {
  it("should render absolute links correctly", async () => {
    await setup();

    const link = screen.getByRole("link", {
      name: /Switch to a production-ready app database/,
    });

    expect(link).toHaveAttribute("href", TEST_H2_LINK);
  });
});
