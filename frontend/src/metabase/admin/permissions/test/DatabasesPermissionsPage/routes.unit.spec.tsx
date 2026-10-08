import { renderWithProviders, screen } from "__support__/ui";
import { DATABASES_PERMISSIONS_PATHS } from "metabase/admin/permissions/routes";
import { Outlet, Route, useParams } from "metabase/router";

// Validates the restructured route shape (depth-enumerated siblings that replaced
// v3's optional groups): the same URLs match and yield the same params the
// optional groups did. v7 matching of these patterns is covered by the
// pattern-translator conformance suite.
function ParamsProbe() {
  const { databaseId, schemaName, tableId } = useParams();
  return (
    <span data-testid="params">
      {JSON.stringify({ databaseId, schemaName, tableId })}
    </span>
  );
}

function setup(initialRoute: string) {
  renderWithProviders(
    <Route path="/admin/permissions/data" element={<Outlet />}>
      {DATABASES_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} element={<ParamsProbe />} />
      ))}
    </Route>,
    { withRouter: true, initialRoute },
  );
}

describe("restructured databases permissions routes", () => {
  it.each([
    ["/admin/permissions/data/database", {}],
    ["/admin/permissions/data/database/1", { databaseId: "1" }],
    [
      "/admin/permissions/data/database/1/table/2",
      { databaseId: "1", tableId: "2" },
    ],
    [
      "/admin/permissions/data/database/1/schema/PUBLIC",
      { databaseId: "1", schemaName: "PUBLIC" },
    ],
    [
      "/admin/permissions/data/database/1/schema/PUBLIC/table/2",
      { databaseId: "1", schemaName: "PUBLIC", tableId: "2" },
    ],
  ])("matches %s and yields the right params", async (url, expected) => {
    setup(url);
    const probe = await screen.findByTestId("params");
    const params = JSON.parse(probe.textContent ?? "{}");
    const defined = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    );
    expect(defined).toEqual(expected);
  });
});
