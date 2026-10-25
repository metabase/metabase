import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupApplicationPermissionsGraphEndpoint,
  setupGroupsEndpoint,
  setupUpdateApplicationPermissionsGraphEndpoint,
  setupUpdateApplicationPermissionsGraphEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { ApplicationPermissionsGraph } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

import { ApplicationPermissionsPage } from "./ApplicationPermissionsPage";

const ALL_USERS = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const ADMINS = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});
const ANALYSTS = createMockGroup({
  id: 3,
  name: "Analysts",
  magic_group_type: null,
});

const GRAPH: ApplicationPermissionsGraph = {
  revision: 1,
  groups: {
    1: { setting: "no", monitoring: "no", subscription: "yes" },
    2: { setting: "yes", monitoring: "yes", subscription: "yes" },
    3: { setting: "no", monitoring: "no", subscription: "no" },
  },
};

type SetupOpts = {
  saveErrorMessage?: string;
};

const setup = ({ saveErrorMessage }: SetupOpts = {}) => {
  setupGroupsEndpoint([ALL_USERS, ADMINS, ANALYSTS]);
  setupApplicationPermissionsGraphEndpoint(GRAPH);
  if (saveErrorMessage != null) {
    setupUpdateApplicationPermissionsGraphEndpointError(saveErrorMessage);
  } else {
    setupUpdateApplicationPermissionsGraphEndpoint({ ...GRAPH, revision: 2 });
  }
  renderWithProviders(<ApplicationPermissionsPage />);
};

const grantAnalystsSettings = async () => {
  const row = await screen.findByRole("row", { name: "Analysts permissions" });
  await userEvent.click(within(row).getAllByTestId("permissions-select")[0]);
  await userEvent.click(
    within(await screen.findByRole("listbox")).getByText("Yes"),
  );
};

const saveChanges = async () => {
  await userEvent.click(await screen.findByText("Save changes"));
  await userEvent.click(await screen.findByRole("button", { name: "Yes" }));
};

describe("ApplicationPermissionsPage", () => {
  it("saves the edited graph with its revision", async () => {
    setup();
    await grantAnalystsSettings();
    await saveChanges();

    await waitFor(() =>
      expect(
        screen.queryByText("You've made changes to permissions."),
      ).not.toBeInTheDocument(),
    );
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/advanced-permissions/application/graph",
      { method: "PUT" },
    );
    const body: unknown =
      typeof call?.options?.body === "string"
        ? JSON.parse(call.options.body)
        : undefined;
    expect(body).toEqual({
      revision: 1,
      groups: {
        ...GRAPH.groups,
        3: { setting: "yes", monitoring: "no", subscription: "no" },
      },
    });
  });

  it("discards unsaved changes on cancel", async () => {
    setup();
    await grantAnalystsSettings();
    expect(
      await screen.findByText("You've made changes to permissions."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("You've made changes to permissions."),
    ).not.toBeInTheDocument();
  });

  it("shows the error and keeps the changes when saving fails", async () => {
    setup({ saveErrorMessage: "Revision is stale" });
    await grantAnalystsSettings();
    await saveChanges();

    expect(
      await screen.findByText("There was an error saving"),
    ).toBeInTheDocument();
    expect(screen.getByText("Revision is stale")).toBeInTheDocument();
    expect(
      screen.getByText("You've made changes to permissions."),
    ).toBeInTheDocument();
  });
});
