import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
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

const ADD_DB_TASK = createMockSetupCheckListTask({
  title: "Add a database",
  group: "Get connected",
  link: "/admin/databases/create",
});

const SWITCH_DB_TASK = createMockSetupCheckListTask({
  title: "Switch to a production-ready app database",
  group: "Productionize",
  link: "https://metabase.test//docs/latest/installation-and-operation/migrating-from-h2",
});

const CHECK_LIST_ITEMS = [
  createMockSetupCheckListItem({
    name: "Get connected",
    tasks: [ADD_DB_TASK],
  }),
  createMockSetupCheckListItem({
    name: "Productionize",
    tasks: [SWITCH_DB_TASK],
  }),
];

interface SetupOpts {
  items?: SetupCheckListItem[];
}

const setup = async ({ items = CHECK_LIST_ITEMS }: SetupOpts = {}) => {
  setupAdminCheckListEndpoint(items);

  const { history } = renderWithProviders(
    <Route path="*" component={SetupCheckList} />,
    { withRouter: true },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));

  return { history };
};

describe("SetupCheckList", () => {
  it("should render relative links correctly", async () => {
    const { history } = await setup();

    const link = screen.getByRole("link", { name: ADD_DB_TASK.title });
    expect(link).not.toHaveAttribute("target");

    userEvent.click(link);
    expect(history?.getCurrentLocation().pathname).toBe(ADD_DB_TASK.link);
  });

  it("should render absolute links correctly", async () => {
    await setup();

    const link = screen.getByRole("link", { name: SWITCH_DB_TASK.title });
    expect(link).toHaveAttribute("href", SWITCH_DB_TASK.link);
    expect(link).toHaveAttribute("target", "_blank");
  });
});
