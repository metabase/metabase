import { Route } from "react-router";

import {
  setupDatabaseEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { Transform } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformRun,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformSettingsSection } from "./TransformSettingsSection";

type SetupOpts = {
  transform?: Transform;
};

function setup({ transform = createMockTransform() }: SetupOpts) {
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
