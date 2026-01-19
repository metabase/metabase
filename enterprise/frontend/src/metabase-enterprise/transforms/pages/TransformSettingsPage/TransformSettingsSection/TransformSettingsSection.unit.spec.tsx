import { Route } from "react-router";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { EnterpriseSettings, Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";
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

  renderWithProviders(
    <Route
      path={Urls.transform(transform.id)}
      component={() => <TransformSettingsSection transform={transform} />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.transform(transform.id),
      storeInitialState: createMockState({
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      }),
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
