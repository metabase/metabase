import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { setupDatabaseEndpoints } from "__support__/server-mocks/database";
import { setupUsersEndpoints } from "__support__/server-mocks/user";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui-with-store";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import * as Urls from "metabase/urls";
import type {
  EnterpriseSettings,
  TokenFeatures,
  Transform,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformRun,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

jest.mock(
  "metabase/transforms/components/IncrementalTransform/useHasCheckpointOptions",
  () => ({
    useHasCheckpointOptions: jest.fn().mockReturnValue({
      hasCheckpointOptions: true,
      hasNativeCheckpointOptions: true,
      transformType: "mbql",
    }),
  }),
);

type SetupOpts = {
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  transform?: Transform;
};

async function setup({
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

  await waitFor(() => {
    expect(screen.getByText("Ownership")).toBeInTheDocument();
  });
}

describe("TransformSettingsSection", () => {
  it("should disable the change target button when the transform is running", async () => {
    await setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeDisabled();
  });

  it("should not disable the change target button when the transform is not running", async () => {
    await setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "failed" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Change target" });
    expect(button).toBeEnabled();
  });

  describe("when remote sync is read-only", () => {
    beforeEach(async () => {
      await setup({ remoteSyncType: "read-only" });
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
  it("should render the ownership section with title and description", async () => {
    await setup({
      transform: createMockTransform(),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
    expect(
      screen.getByText("Specify who is responsible for this transform."),
    ).toBeInTheDocument();
  });

  it("should render the owner label", async () => {
    await setup({
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

  it("should display external email when owner_email is set", async () => {
    await setup({
      transform: createMockTransform({
        owner_email: "external@example.com",
        owner: createMockTransformOwner({ email: "external@example.com" }),
      }),
    });
    expect(screen.getByText("Ownership")).toBeInTheDocument();
  });
});

describe("TargetSection", () => {
  it("should not render a edit table metadata button when the target table does not exist", async () => {
    await setup({});

    expect(
      await screen.findByRole("button", { name: /Change target/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: /Edit this table/ }),
    ).not.toBeInTheDocument();
  });
  it("should link you to a page where you can edit the target tables metadata", async () => {
    await setup({
      transform: createMockTransform({
        table: createMockTable(),
      }),
    });

    expect(
      await screen.findByRole("button", { name: /Change target/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Edit this table/ }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/data-studio/data/database"),
    );
  });
});
