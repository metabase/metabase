import { renderWithProviders, screen } from "__support__/ui";
import type { RouterEngine } from "metabase/router";
import { Outlet, Route, useParams } from "metabase/router";

// A stub standing in for the permissions page, to validate the restructured
// route shape (depth-enumerated siblings that replaced v3's optional groups)
// matches the same URLs and yields the same params on both engines. The real
// page is exercised elsewhere; here we isolate the routing.
function ParamsProbe() {
  const { databaseId, schemaName, tableId } = useParams();
  return (
    <span data-testid="params">
      {JSON.stringify({ databaseId, schemaName, tableId })}
    </span>
  );
}

// Mirrors DATABASES_PERMISSIONS_PATHS in routes.tsx.
const DATABASES_PERMISSIONS_PATHS = [
  "database",
  "database/:databaseId",
  "database/:databaseId/schema/:schemaName",
  "database/:databaseId/schema/:schemaName/table/:tableId",
];

function setup(routerEngine: RouterEngine, initialRoute: string) {
  renderWithProviders(
    <Route path="/admin/permissions/data" element={<Outlet />}>
      {DATABASES_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} element={<ParamsProbe />} />
      ))}
    </Route>,
    { withRouter: true, routerEngine, initialRoute },
  );
}

describe.each<RouterEngine>(["v3", "v7"])(
  "restructured databases permissions routes on the %s engine",
  (routerEngine) => {
    it.each([
      ["/admin/permissions/data/database", {}],
      ["/admin/permissions/data/database/1", { databaseId: "1" }],
      [
        "/admin/permissions/data/database/1/schema/PUBLIC",
        { databaseId: "1", schemaName: "PUBLIC" },
      ],
      [
        "/admin/permissions/data/database/1/schema/PUBLIC/table/2",
        { databaseId: "1", schemaName: "PUBLIC", tableId: "2" },
      ],
    ])("matches %s and yields the right params", async (url, expected) => {
      setup(routerEngine, url);
      const probe = await screen.findByTestId("params");
      const params = JSON.parse(probe.textContent ?? "{}");
      const defined = Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined),
      );
      expect(defined).toEqual(expected);
    });
  },
);
