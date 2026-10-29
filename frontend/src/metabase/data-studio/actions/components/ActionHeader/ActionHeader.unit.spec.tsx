import userEvent from "@testing-library/user-event";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import type { WritebackAction } from "metabase-types/api";
import {
  createMockCollection,
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
});
