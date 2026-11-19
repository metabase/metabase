import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { PLUGIN_DATA_TESTING } from "metabase/plugins";
import { Route } from "metabase/router";
import type { WritebackAction } from "metabase-types/api";
import {
  createMockCollection,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionHeader } from "./ActionHeader";

type SetupOpts = {
  action: WritebackAction;
};

function setup({ action }: SetupOpts) {
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });

  renderWithProviders(
    <Route
      path="/data-studio/data-actions/:actionId"
      element={<ActionHeader action={action} />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/data-actions/${action.id}`,
    },
  );
}

describe("ActionHeader", () => {
  it("should let a user who can edit the action rename, move and archive it", async () => {
    setup({
      action: createMockQueryAction({
        name: "Update order",
        can_write: true,
      }),
    });

    expect(screen.getByDisplayValue("Update order")).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Action options" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: /Move/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Archive/ }),
    ).toBeInTheDocument();
  });

  it("should not let a user who can't edit the action rename, move or archive it", () => {
    setup({
      action: createMockQueryAction({
        name: "Update order",
        can_write: false,
      }),
    });

    expect(screen.getByDisplayValue("Update order")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Action options" }),
    ).not.toBeInTheDocument();
  });

  describe("Tests tab", () => {
    afterEach(() => {
      PLUGIN_DATA_TESTING.isEnabled = false;
    });

    it("should not show when testing is not enabled", () => {
      setup({ action: createMockQueryAction() });

      expect(screen.getByRole("tab", { name: "Run" })).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Tests" }),
      ).not.toBeInTheDocument();
    });

    it("should link to the tests of a query action", () => {
      PLUGIN_DATA_TESTING.isEnabled = true;
      setup({ action: createMockQueryAction({ id: 7 }) });

      expect(screen.getByRole("tab", { name: "Tests" })).toHaveAttribute(
        "href",
        "/data-studio/actions/7/tests",
      );
    });

    it("should not show for an implicit action", () => {
      PLUGIN_DATA_TESTING.isEnabled = true;
      setup({ action: createMockImplicitQueryAction() });

      expect(screen.getByRole("tab", { name: "Run" })).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Tests" }),
      ).not.toBeInTheDocument();
    });
  });
});
