import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupDatabaseEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type {
  EnterpriseSettings,
  TokenFeatures,
  Transform,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformRun,
  createMockUser,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

type SetupOpts = {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  transform?: Transform;
};

function setup({
  transform = createMockTransform(),
  remoteSyncType,
}: SetupOpts) {
  setupDatabaseEndpoints(createMockDatabase({ id: 1 }));
  setupUsersEndpoints([
    createMockUser({
      id: 1,
      common_name: "Test Owner",
      email: "test@example.com",
    }),
    createMockUser({
      id: 2,
      common_name: "Another User",
      email: "another@example.com",
    }),
  ]);

  let state: State;
  if (remoteSyncType) {
    const tokenFeatures: Partial<TokenFeatures> = {
      remote_sync: !!remoteSyncType,
    };
    const settings = mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
      "token-features": createMockTokenFeatures(tokenFeatures),
    });
    state = createMockState({
      settings,
    });

    const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  } else {
    state = createMockState({
      settings: mockSettings({
        "remote-sync-type": remoteSyncType,
        "remote-sync-enabled": !!remoteSyncType,
      }),
    });
  }

  renderWithProviders(
    <Route
      path={Urls.transform(transform.id)}
      component={() => <TransformSettingsSection transform={transform} />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.transform(transform.id),
      storeInitialState: state,
    },
  );
}

describe("TransformSettingsSection", () => {
  it("should disable the change target button when the transform is running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeDisabled();
  });

  it("should not disable the change target button when the transform is not running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "failed" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeEnabled();
  });

  describe("when remote sync is read-only", () => {
    beforeEach(() => {
      setup({ remoteSyncType: "read-only" });
    });

    it("does not show the change target button", () => {
      expect(
        screen.queryByRole("button", { name: "Change target" }),
      ).not.toBeInTheDocument();
    });

    it("makes Incremental transformation switch disabled", () => {
      expect(
        screen.getByRole("switch", {
          name: /Only process new and changed data/,
        }),
      ).toBeDisabled();
    });
  });
});

describe("OwnerSection", () => {
  it("should render the ownership section with title and description", () => {
    setup({
      transform: createMockTransform(),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
    expect(
      screen.getByText("Specify who is responsible for this transform."),
    ).toBeInTheDocument();
  });

  it("should render the owner label", () => {
    setup({
      transform: createMockTransform({
        owner_user_id: 1,
        owner: createMockTransformOwner({
          id: 1,
          first_name: "Test",
          last_name: "Owner",
        }),
      }),
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("should display external email when owner_email is set", () => {
    setup({
      transform: createMockTransform({
        owner_email: "external@example.com",
        owner: createMockTransformOwner({ email: "external@example.com" }),
      }),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
  });
});
