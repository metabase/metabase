import { render, screen } from "@testing-library/react";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
  getPermissionsBasePath,
  resetPermissionsBasePath,
  setPermissionsBasePath,
} from "metabase/common/components/PermissionsBasePath/base-path";

import { PermissionsBasePath } from "./PermissionsBasePath";

const HUB_PERMISSIONS_BASE_PATH = "/embedding/permissions";
const TEST_OWNER_ID = "test";

// What a child that builds a URL during its own render sees. The URL builders
// run from redux selectors at render time, so reading in an effect would test
// a later moment than the one that matters.
function ShowBasePath() {
  return <span data-testid="base-path">{getPermissionsBasePath()}</span>;
}

describe("PermissionsBasePath", () => {
  afterEach(() => {
    resetPermissionsBasePath(TEST_OWNER_ID);
  });

  it("declares its host's base path before its children render", () => {
    render(
      <PermissionsBasePath basePath={HUB_PERMISSIONS_BASE_PATH}>
        <ShowBasePath />
      </PermissionsBasePath>,
    );

    expect(screen.getByTestId("base-path")).toHaveTextContent(
      HUB_PERMISSIONS_BASE_PATH,
    );
  });

  it("declares admin's base path when a host names none", () => {
    // Admin wraps its own routes without a `basePath`, so the default is what
    // puts the value back after the hub's copy of the editor set it. It has to
    // land during render: admin's breadcrumb selectors build hrefs on their
    // first pass, before the hub's unmount cleanup has run.
    setPermissionsBasePath(HUB_PERMISSIONS_BASE_PATH, TEST_OWNER_ID);

    render(
      <PermissionsBasePath>
        <ShowBasePath />
      </PermissionsBasePath>,
    );

    expect(screen.getByTestId("base-path")).toHaveTextContent(
      ADMIN_PERMISSIONS_BASE_PATH,
    );
  });

  it("restores admin's base path on unmount", () => {
    const { unmount } = render(
      <PermissionsBasePath basePath={HUB_PERMISSIONS_BASE_PATH}>
        <ShowBasePath />
      </PermissionsBasePath>,
    );

    unmount();

    expect(getPermissionsBasePath()).toBe(ADMIN_PERMISSIONS_BASE_PATH);
  });

  it("doesn't clobber a base path a later host already claimed", () => {
    // Tenancy -> Permissions in the hub: React renders Permissions' new
    // PermissionsBasePath (claiming the base path) before running Tenancy's
    // unmount cleanup. An unconditional reset there would undo what
    // Permissions just set. Both hosts claim the same path, so only the
    // owning id tells them apart.
    const { unmount } = render(
      <PermissionsBasePath basePath={HUB_PERMISSIONS_BASE_PATH} />,
    );
    render(<PermissionsBasePath basePath={HUB_PERMISSIONS_BASE_PATH} />);

    unmount();

    expect(getPermissionsBasePath()).toBe(HUB_PERMISSIONS_BASE_PATH);
  });
});
