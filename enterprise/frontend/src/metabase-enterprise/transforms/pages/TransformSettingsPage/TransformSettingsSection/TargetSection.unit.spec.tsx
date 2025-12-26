import { Route } from "react-router";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

type SetupOpts = {
  transform?: Transform;
};

function setup({ transform = createMockTransform() }: SetupOpts) {
  setupDatabaseEndpoints(createMockDatabase({ id: 1 }));

  renderWithProviders(
    <Route
      path={Urls.transform(transform.id)}
      component={() => <TransformSettingsSection transform={transform} />}
    />,
    { withRouter: true, initialRoute: Urls.transform(transform.id) },
  );
}

describe("TargetSection", () => {
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
});
