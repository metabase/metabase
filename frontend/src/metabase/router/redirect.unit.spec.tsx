import type { PropsWithChildren } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { redirect } from "./redirect";
import { Route } from "./route";

const Parent = ({ children }: PropsWithChildren) => <div>{children}</div>;
const DataLayout = ({ children }: PropsWithChildren) => (
  <div>
    <aside data-testid="perm-side">side</aside>
    {children}
  </div>
);
const GroupPage = () => <div>group page</div>;

function mountRoutes(tree: JSX.Element, initialRoute: string) {
  const { history } = renderWithProviders(tree, {
    withRouter: true,
    initialRoute,
  });
  return history;
}

describe("router/redirect", () => {
  it("resolves a chained two-level index redirect (permissions repro)", async () => {
    const history = mountRoutes(
      <Route path="/admin">
        <Route path="permissions" component={Parent}>
          <Route>
            <Route index component={redirect("data")} />
            <Route path="data" component={DataLayout}>
              <Route index component={redirect("group")} />
              <Route path="group" component={GroupPage} />
            </Route>
          </Route>
        </Route>
      </Route>,
      "/admin/permissions",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/admin/permissions/data/group",
      ),
    );
    expect(await screen.findByTestId("perm-side")).toBeInTheDocument();
    expect(await screen.findByText("group page")).toBeInTheDocument();
  });

  it("redirects to an absolute target", async () => {
    const history = mountRoutes(
      <Route path="start" component={redirect("/browse/models")} />,
      "/start",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/browse/models"),
    );
  });

  it("resolves a relative target against the parent of the `from` match", async () => {
    const history = mountRoutes(
      <Route path="collection" component={Parent}>
        <Route path="archive" component={redirect("trash")} />
      </Route>,
      "/collection/archive",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/collection/trash"),
    );
  });

  it("interpolates params into a relative target", async () => {
    const history = mountRoutes(
      <Route path="browse" component={Parent}>
        <Route
          path=":dbId-:slug"
          component={redirect("databases/:dbId-:slug")}
        />
      </Route>,
      "/browse/5-orders",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/5-orders",
      ),
    );
  });

  it("resolves a relative target under a multi-segment `from`", async () => {
    const from = "table/:tableId/field/:fieldId/:section";
    const to = "table/:tableId/field/:fieldId";
    const history = mountRoutes(
      <Route path="model" component={Parent}>
        <Route path={from} component={redirect(to)} />
      </Route>,
      "/model/table/9/field/3/settings",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/model/table/9/field/3",
      ),
    );
  });

  it("resolves against the route tree, re-encoding params like v3", async () => {
    const from = "database/:databaseId/schema/:schemaId/table/:tableId";
    const to = `${from}/details`;
    const history = mountRoutes(
      <Route path="data-studio/data" component={Parent}>
        <Route path={from} component={redirect(to)} />
      </Route>,
      // `1:PUBLIC` arrives encoded as `1%3APUBLIC`
      "/data-studio/data/database/1/schema/1%3APUBLIC/table/2",
    );

    // v3's formatPattern re-encodes the interpolated param, so the target keeps
    // the encoded schema segment rather than doubling the path.
    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/data-studio/data/database/1/schema/1%3APUBLIC/table/2/details",
      ),
    );
  });

  it("carries the splat into an absolute target", async () => {
    const history = mountRoutes(
      <Route
        path="admin/transforms/*"
        component={redirect("/data-studio/transforms/*")}
      />,
      "/admin/transforms/jobs/7",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/data-studio/transforms/jobs/7",
      ),
    );
  });

  it("redirects from an index route to a relative sibling of the parent", async () => {
    const history = mountRoutes(
      <Route path="tools" component={Parent}>
        <Route index component={redirect("list")} />
      </Route>,
      "/tools",
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/tools/list"),
    );
  });

  it("preserves the query string and drops the hash, like v3", async () => {
    const history = mountRoutes(
      <Route path="start" component={redirect("/dest")} />,
      "/start?foo=bar#frag",
    );

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/dest");
      expect(location?.search).toBe("?foo=bar");
      expect(location?.hash).toBe("");
    });
  });
});
