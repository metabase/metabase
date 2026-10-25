import userEvent from "@testing-library/user-event";

import {
  setupDatabaseEndpoints,
  setupDatabaseMetadataEndpoint,
  setupExistingImpersonationEndpoint,
  setupGroupsEndpoint,
  setupMissingImpersonationEndpoint,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  DataPermissionsProvider,
  useDataPermissions,
} from "metabase/permissions";
import { Route, useLocation, useParams } from "metabase/router";
import { ImpersonationModal } from "metabase-enterprise/advanced_permissions/components/ImpersonationModal/ImpersonationModal";
import {
  createMockDatabase,
  createMockImpersonation,
  createMockTable,
} from "metabase-types/api/mocks";

function RoutedImpersonationModal({ onClose }: { onClose: () => void }) {
  const params = useParams();
  const location = useLocation();
  return (
    <DataPermissionsProvider>
      <ImpersonationModal
        params={params}
        location={location}
        onClose={onClose}
      />
      <ImpersonationDrafts />
    </DataPermissionsProvider>
  );
}

function ImpersonationDrafts() {
  const { drafts } = useDataPermissions();
  return (
    <output data-testid="impersonation-drafts">
      {JSON.stringify(drafts.impersonations)}
    </output>
  );
}

const getImpersonationDrafts = (): unknown =>
  JSON.parse(screen.getByTestId("impersonation-drafts").textContent ?? "");

const groupId = 2;
const databaseId = 1;
const selectedAttribute = "foo";
const defaultUserAttributes = ["foo", "bar"];

const setup = async ({
  userAttributes = defaultUserAttributes,
  hasImpersonation = true,
  databaseDetails = {},
} = {}) => {
  const onClose = jest.fn();
  const database = createMockDatabase({
    id: databaseId,
    tables: [createMockTable()],
    ...databaseDetails,
  });
  setupDatabaseEndpoints(database);
  setupDatabaseMetadataEndpoint(database);
  setupGroupsEndpoint([]);
  setupUserAttributesEndpoint(userAttributes);

  if (hasImpersonation) {
    setupExistingImpersonationEndpoint(
      createMockImpersonation({
        db_id: databaseId,
        group_id: groupId,
        attribute: selectedAttribute,
      }),
    );
  } else {
    setupMissingImpersonationEndpoint(databaseId, groupId);
  }

  renderWithProviders(
    <>
      <Route path="/" />
      <Route
        path="database/:databaseId/impersonated/group/:groupId"
        element={<RoutedImpersonationModal onClose={onClose} />}
      />
    </>,
    {
      initialRoute: `database/${databaseId}/impersonated/group/${groupId}`,
      withRouter: true,
    },
  );

  await waitForLoaderToBeRemoved();

  return { onClose };
};

describe("impersonation modal", () => {
  it("should render the content", async () => {
    await setup();
    expect(
      await screen.findByText("Map a user attribute to database roles"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "When the person runs a query (including native queries), Metabase will impersonate the privileges of the database role you associate with the user attribute.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /learn more/i }),
    ).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/permissions/data.html",
    );

    expect(
      await screen.findByText(
        "Make sure the main database credential has access to everything different user groups may need access to. It's what Metabase uses to sync table information.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /edit settings/i }),
    ).toHaveAttribute("href", "/admin/databases/1/edit");
  });

  it("should refer to 'users' instead of 'roles' for redshift impersonation", async () => {
    await setup({ databaseDetails: { engine: "redshift" } });
    expect(
      await screen.findByText(
        "Map a Metabase user attribute to database users",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "When the person runs a query (including native queries), Metabase will impersonate the privileges of the database user you associate with the user attribute.",
      ),
    ).toBeInTheDocument();
  });

  it("should not update impersonation if it has not changed", async () => {
    await setup({ userAttributes: ["foo"] });

    await userEvent.click(screen.getByText(/save/i));

    expect(getImpersonationDrafts()).toHaveLength(0);
  });

  it("should create impersonation", async () => {
    const { onClose } = await setup({ hasImpersonation: false });

    await userEvent.click(
      await screen.findByPlaceholderText("Pick a user attribute"),
    );
    await userEvent.click(await screen.findByText("foo"));

    expect(await screen.findByRole("button", { name: /save/i })).toBeEnabled();
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(getImpersonationDrafts()).toStrictEqual([
        {
          attribute: "foo",
          db_id: 1,
          group_id: 2,
        },
      ]);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("should update impersonation", async () => {
    const { onClose } = await setup();

    await userEvent.click(
      await screen.findByPlaceholderText("Pick a user attribute"),
    );
    await userEvent.click(await screen.findByText("bar"));

    expect(await screen.findByRole("button", { name: /save/i })).toBeEnabled();
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(getImpersonationDrafts()).toStrictEqual([
        {
          attribute: "bar",
          db_id: 1,
          group_id: 2,
        },
      ]);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("should show only already selected attribute if attributes array is empty", async () => {
    await setup({ hasImpersonation: true, userAttributes: [] });

    await expect(
      screen.getByPlaceholderText("Pick a user attribute"),
    ).toHaveValue(selectedAttribute);
    expect(await screen.findByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("should show a link to the database settings if the engine requires a role and there is no role", async () => {
    await setup({
      hasImpersonation: false,
      userAttributes: [],
      databaseDetails: {
        engine: "snowflake",
        features: ["connection-impersonation-requires-role"],
      },
    });

    expect(
      await screen.findByText(
        "Connection impersonation requires specifying a user role on the database connection.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /edit connection/i }),
    ).toHaveAttribute("href", "/admin/databases/1");

    expect(await screen.findByRole("button", { name: /close/i })).toBeEnabled();
  });

  it("should show the link to people settings if there is no impersonation and no attributes", async () => {
    await setup({ hasImpersonation: false, userAttributes: [] });

    expect(
      await screen.findByText(
        "To associate a user with a database role, you'll need to give that user at least one user attribute.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /edit user settings/i }),
    ).toHaveAttribute("href", "/admin/people");

    expect(await screen.findByRole("button", { name: /close/i })).toBeEnabled();
  });
});
