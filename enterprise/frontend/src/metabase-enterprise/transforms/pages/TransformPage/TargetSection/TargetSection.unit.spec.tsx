import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { getTransformUrl } from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { TargetSection } from "./TargetSection";

type SetupOpts = {
  transform?: Transform;
};

function setup({ transform = createMockTransform() }: SetupOpts) {
  renderWithProviders(
    <Route
      path={getTransformUrl(transform.id)}
      component={() => <TargetSection transform={transform} />}
    />,
    { withRouter: true, initialRoute: getTransformUrl(transform.id) },
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
