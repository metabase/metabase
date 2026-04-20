import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { CreateTransformMenu } from "./CreateTransformMenu";

const DATABASE = createMockDatabase({
  id: 1,
  transforms_permissions: "write",
});

type SetupOpts = {
  isReadOnlyMode?: boolean;
};

function setup({ isReadOnlyMode = false }: SetupOpts = {}) {
  setupDatabasesEndpoints([DATABASE]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "read-only-mode": isReadOnlyMode,
    }),
  });

  renderWithProviders(
    <Route path="*" component={() => <CreateTransformMenu />} />,
    {
      withRouter: true,
      initialRoute: "/",
      storeInitialState: state,
    },
  );
}

describe("CreateTransformMenu", () => {
  describe("read-only mode", () => {
    it("should disable the New button when instance is in read-only mode", async () => {
      setup({ isReadOnlyMode: true });

      const button = screen.getByRole("button", {
        name: /Create a transform/,
      });
      expect(button).toBeDisabled();

      await userEvent.hover(button);

      expect(
        await screen.findByText(
          "Transforms can't be created when the instance is in read-only mode",
        ),
      ).toBeInTheDocument();
    });

    it("should show the New button as enabled when not in read-only mode", async () => {
      setup({ isReadOnlyMode: false });

      const button = await screen.findByRole("button", {
        name: /Create a transform/,
      });
      expect(button).toBeEnabled();
    });
  });
});
