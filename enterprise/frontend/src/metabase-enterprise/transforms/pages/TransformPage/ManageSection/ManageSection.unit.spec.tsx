import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { getTransformUrl } from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { ManageSection } from "./ManageSection";

type SetupOpts = {
  transform?: Transform;
};

function setup({ transform = createMockTransform() }: SetupOpts) {
  renderWithProviders(
    <Route
      path={getTransformUrl(transform.id)}
      component={() => <ManageSection transform={transform} />}
    />,
    { withRouter: true, initialRoute: getTransformUrl(transform.id) },
  );
}

describe("ManageSection", () => {
  it("should disable the edit query button when the transform is running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Edit query" });
    expect(button).toBeDisabled();
  });

  it("should not disable the edit query button when the transform is not running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "failed" }),
      }),
    });
    const button = screen.getByRole("link", { name: "Edit query" });
    expect(button).toBeEnabled();
  });

  it("should disable the delete button when the transform is running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "started" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Delete transform" });
    expect(button).toBeDisabled();
  });

  it("should not disable the delete button when the transform is not running", () => {
    setup({
      transform: createMockTransform({
        last_run: createMockTransformRun({ status: "succeeded" }),
      }),
    });
    const button = screen.getByRole("button", { name: "Delete transform" });
    expect(button).toBeEnabled();
  });
});
