import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  createMockSetupGuideChecklist,
  setupAdhocQueryEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionTreeEndpoint,
  setupCreateTenantEndpoint,
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSearchEndpoints,
  setupSetupGuideChecklistEndpoint,
  setupTenantEntpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Route } from "metabase/router";
import type {
  DataSegregationStrategy,
  Database,
  Tenant,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockDataset,
  createMockField,
  createMockGroup,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupGuideChecklist } from "../../api/setup-guide";

import { SetupPermissionsAndTenantsPage } from "./SetupPermissionsAndTenantsPage";

const PAGE_PATH = "/embedding/get-started/permissions";
const DEFAULT_RETURN_PATH = "/embedding/get-started";

const SHARED_COLLECTION = createMockCollection({
  id: 42,
  name: "Shared collection",
});

const ALL_EXTERNAL_USERS_GROUP = createMockGroup({
  id: 7,
  name: "All tenant users",
  magic_group_type: "all-external-users",
});

const DATABASE_WITHOUT_IMPERSONATION = createMockDatabase({
  id: 11,
  name: "H2 Database",
  features: ["basic-aggregations"],
});

const USER_ID_FIELD = createMockField({
  id: 31,
  table_id: 21,
  name: "USER_ID",
  display_name: "User ID",
});

const ORDERS_TABLE = createMockTable({
  id: 21,
  db_id: 13,
  name: "ORDERS",
  display_name: "Orders",
  schema: "PUBLIC",
  fields: [
    createMockField({ id: 30, table_id: 21, display_name: "ID", name: "ID" }),
    USER_ID_FIELD,
  ],
});

const RLS_DATABASE = createMockDatabase({
  id: 13,
  name: "QA Postgres12",
  tables: [ORDERS_TABLE],
});

const DATABASE_WITH_IMPERSONATION = createMockDatabase({
  id: 12,
  name: "QA Postgres12",
  engine: "postgres",
  features: ["basic-aggregations", "connection-impersonation"],
});

// Everything up to the data segregation step is done.
const TENANTS_ENABLED_CHECKLIST: Partial<SetupGuideChecklist> = {
  "enable-tenants": true,
  "move-dashboard-to-shared": true,
};

// The data segregation is configured, so only creating tenants is left.
const RLS_CONFIGURED_CHECKLIST: Partial<SetupGuideChecklist> = {
  ...TENANTS_ENABLED_CHECKLIST,
  "setup-data-segregation-strategy": true,
};

interface SetupOpts {
  checklist?: Partial<SetupGuideChecklist>;
  strategy?: DataSegregationStrategy | null;
  /** What the backend detects once the permissions graph was saved. */
  strategyAfterPermissionsUpdate?: DataSegregationStrategy;
  databases?: Database[];
  sharedCollections?: ReturnType<typeof createMockCollection>[];
  tenants?: Tenant[];
  createTenantError?: string;
}

const setup = ({
  checklist = {},
  strategy = null,
  strategyAfterPermissionsUpdate,
  databases = [DATABASE_WITHOUT_IMPERSONATION],
  sharedCollections = [SHARED_COLLECTION],
  tenants = [],
  createTenantError,
}: SetupOpts = {}) => {
  const settingsState = mockSettings({
    "token-features": createMockTokenFeatures({ tenants: true }),
    "use-tenants": true,
  });
  setupEnterpriseOnlyPlugin("tenants");

  let isPermissionsGraphSaved = false;

  setupSetupGuideChecklistEndpoint(() => ({
    checklist: createMockSetupGuideChecklist(checklist),
    strategy:
      isPermissionsGraphSaved && strategyAfterPermissionsUpdate
        ? strategyAfterPermissionsUpdate
        : strategy,
  }));
  setupCollectionTreeEndpoint(sharedCollections);
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupDatabasesEndpoints(databases, { hasSavedQuestions: false });
  fetchMock.get(
    "path:/api/table",
    databases.flatMap((db) => db.tables ?? []),
  );
  fetchMock.get("path:/api/mt/gtap", []);

  // the table picker of the row-level security step
  mockGetBoundingClientRect(); // for virtualization
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"], {}, true);
  setupAdhocQueryEndpoint(createMockDataset({ data: { rows: [[1], [2]] } }));
  setupGroupsEndpoint([ALL_EXTERNAL_USERS_GROUP]);
  setupPermissionsGraphEndpoints([ALL_EXTERNAL_USERS_GROUP], databases);
  fetchMock.put("path:/api/permissions/graph", () => {
    isPermissionsGraphSaved = true;
    return {};
  });
  setupTenantEntpoints(tenants);
  setupCreateTenantEndpoint(
    createTenantError ? { status: 400, body: createTenantError } : undefined,
  );

  const { router } = renderWithProviders(
    <>
      <Route path={PAGE_PATH} element={<SetupPermissionsAndTenantsPage />} />
      <Route
        path={DEFAULT_RETURN_PATH}
        element={<div>Back on the setup guide</div>}
      />
    </>,
    {
      storeInitialState: createMockState({
        settings: settingsState,
      }),
      withRouter: true,
      withUndos: true,
      initialRoute: PAGE_PATH,
    },
  );

  if (!router) {
    throw new Error("Expected a router");
  }

  return { router };
};

const getStep = (name: string) => screen.getByRole("listitem", { name });

const findStep = (name: string) => screen.findByRole("listitem", { name });

const STEP_TITLES = {
  enableTenants: "Enable multi-tenant user strategy",
  moveDashboard: "Create a dashboard in the shared collection",
  dataSegregation: "Which data segregation strategy does your database use?",
  selectData: "Select data to make available",
  createTenants: "Create tenants",
  summary: "Summary",
};

const openStep = async (name: string) => {
  await userEvent.click(await findStep(name));
};

const chooseStrategy = async (strategyLabel: RegExp, confirmText: string) => {
  await userEvent.click(
    await screen.findByRole("radio", { name: strategyLabel }),
  );
  await userEvent.click(screen.getByRole("button", { name: confirmText }));
};

const fillTenant = async ({
  index,
  name,
  slug,
  getAttributeInputs,
  attributeValue,
}: {
  index: number;
  name: string;
  slug: string;
  getAttributeInputs: () => HTMLElement[];
  attributeValue: string;
}) => {
  const nameInput = screen.getAllByPlaceholderText("Tenant name")[index];
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, name);

  await userEvent.type(getAttributeInputs()[index], attributeValue);

  // typing the name generates a slug, so set the slug last
  const slugInput = screen.getAllByPlaceholderText("tenant-slug")[index];
  await userEvent.clear(slugInput);
  await userEvent.type(slugInput, slug);
};

const submitTenants = () =>
  userEvent.click(screen.getByRole("button", { name: "Create tenants" }));

const getCreateTenantBodies = (): unknown[] =>
  fetchMock.callHistory
    .calls("create-tenant")
    .map((call) => JSON.parse(String(call.options?.body)));

const getTextWithContent = (content: string) =>
  screen.getByText((_, element) => element?.textContent === content);

const expectTenantsCreatedToast = async () => {
  expect(
    await screen.findByText("Tenants created successfully"),
  ).toBeInTheDocument();
};

describe("SetupPermissionsAndTenantsPage", () => {
  it('"Configure data permissions and tenants" card should navigate to permissions onboarding page (page heading)', async () => {
    setup();

    expect(
      await screen.findByRole("heading", {
        name: "Configure data permissions and enable tenants",
        level: 1,
      }),
    ).toBeInTheDocument();
  });

  describe("permissions setup page should mark steps as completed", () => {
    it("permissions setup page should mark steps as completed (no steps completed)", async () => {
      setup();

      await findStep(STEP_TITLES.summary);
      await waitForRequestsToSettle();

      for (const title of Object.values(STEP_TITLES)) {
        expect(getStep(title)).toHaveAttribute("data-completed", "false");
      }
    });

    it("permissions setup page should mark steps as completed (tenants enabled and created)", async () => {
      setup({
        checklist: { "enable-tenants": true, "create-tenants": true },
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.enableTenants)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );

      expect(getStep(STEP_TITLES.createTenants)).toHaveAttribute(
        "data-completed",
        "true",
      );
      expect(getStep(STEP_TITLES.moveDashboard)).toHaveAttribute(
        "data-completed",
        "false",
      );
      expect(getStep(STEP_TITLES.dataSegregation)).toHaveAttribute(
        "data-completed",
        "false",
      );
      expect(getStep(STEP_TITLES.selectData)).toHaveAttribute(
        "data-completed",
        "false",
      );
      expect(getStep(STEP_TITLES.summary)).toHaveAttribute(
        "data-completed",
        "false",
      );
    });

    it("permissions setup page should mark steps as completed (row-level security configured)", async () => {
      setup({
        checklist: {
          "enable-tenants": true,
          "setup-data-segregation-strategy": true,
          "create-tenants": true,
        },
        strategy: "row-column-level-security",
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.summary)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );

      for (const title of [
        STEP_TITLES.enableTenants,
        STEP_TITLES.dataSegregation,
        STEP_TITLES.selectData,
        STEP_TITLES.createTenants,
        STEP_TITLES.summary,
      ]) {
        expect(getStep(title)).toHaveAttribute("data-completed", "true");
      }
      expect(getStep(STEP_TITLES.moveDashboard)).toHaveAttribute(
        "data-completed",
        "false",
      );
    });
  });

  describe('"Enable tenants and create shared collection" button should be disabled when already set up', () => {
    const BUTTON_NAME = "Enable tenants and create shared collection";

    it('"Enable tenants and create shared collection" button should be disabled when already set up (enabled while no shared collection exists)', async () => {
      setup({
        checklist: { "enable-tenants": false },
        sharedCollections: [],
      });

      const button = await screen.findByRole("button", { name: BUTTON_NAME });
      await waitForRequestsToSettle();

      expect(getStep(STEP_TITLES.enableTenants)).toHaveAttribute(
        "data-completed",
        "false",
      );
      expect(button).toBeEnabled();
    });

    it('"Enable tenants and create shared collection" button should be disabled when already set up (enabled while only the setting is on)', async () => {
      setup({
        checklist: { "enable-tenants": true },
        sharedCollections: [],
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.enableTenants)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );
      await waitForRequestsToSettle();

      await openStep(STEP_TITLES.enableTenants);

      expect(
        await screen.findByRole("button", { name: BUTTON_NAME }),
      ).toBeEnabled();
    });

    it('"Enable tenants and create shared collection" button should be disabled when already set up (disabled once the setup is complete)', async () => {
      setup({
        checklist: { "enable-tenants": true },
        sharedCollections: [SHARED_COLLECTION],
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.enableTenants)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );
      await waitForRequestsToSettle();

      // the completed step is collapsed, so open it
      await openStep(STEP_TITLES.enableTenants);

      expect(
        await screen.findByRole("button", { name: BUTTON_NAME }),
      ).toBeDisabled();
    });
  });

  it("selecting database routing strategy should show documentation link in step 3", async () => {
    setup({ checklist: TENANTS_ENABLED_CHECKLIST });

    await chooseStrategy(/Database routing/, "Use database routing");

    expect(
      await screen.findByText("Manage data permissions with database routing"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View the guide/i }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/permissions/database-routing"),
    );
  });

  describe("create tenants step", () => {
    it("can create two tenants and show summary", async () => {
      const { router } = setup({
        checklist: RLS_CONFIGURED_CHECKLIST,
        strategy: "row-column-level-security",
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.enableTenants)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );

      await openStep(STEP_TITLES.createTenants);

      await fillTenant({
        index: 0,
        name: "Acme Corp",
        slug: "acme-corp-slug",
        getAttributeInputs: () => screen.getAllByLabelText("organization_id"),
        attributeValue: "acme-123",
      });

      await userEvent.click(screen.getByRole("button", { name: /New tenant/ }));
      expect(screen.getAllByPlaceholderText("Tenant name")).toHaveLength(2);

      await fillTenant({
        index: 1,
        name: "Beta Inc",
        slug: "beta-inc-slug",
        getAttributeInputs: () => screen.getAllByLabelText("organization_id"),
        attributeValue: "beta-456",
      });

      await submitTenants();
      await expectTenantsCreatedToast();

      expect(getCreateTenantBodies()).toEqual([
        {
          name: "Acme Corp",
          slug: "acme-corp-slug",
          attributes: { organization_id: "acme-123" },
        },
        {
          name: "Beta Inc",
          slug: "beta-inc-slug",
          attributes: { organization_id: "beta-456" },
        },
      ]);

      await waitFor(() =>
        expect(getStep(STEP_TITLES.createTenants)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );
      expect(
        screen.getByText("You created the following tenants"),
      ).toBeInTheDocument();

      // the active summary step hides its title
      expect(screen.queryByText("Summary")).not.toBeInTheDocument();

      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("acme-corp-slug")).toBeInTheDocument();
      expect(screen.getByText("Beta Inc")).toBeInTheDocument();
      expect(screen.getByText("beta-inc-slug")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Tenants/ })).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(await screen.findByText("Back on the setup guide")).toBeVisible();
      expect(router.location.pathname).toBe(DEFAULT_RETURN_PATH);
    });

    it("shows error toast when creating a tenant with duplicate slug", async () => {
      setup({
        checklist: RLS_CONFIGURED_CHECKLIST,
        strategy: "row-column-level-security",
        createTenantError: "This tenant name or slug is already taken.",
      });

      await openStep(STEP_TITLES.createTenants);

      await fillTenant({
        index: 0,
        name: "Another Tenant",
        slug: "existing-tenant",
        getAttributeInputs: () => screen.getAllByLabelText("organization_id"),
        attributeValue: "another-id",
      });
      await submitTenants();

      expect(
        await screen.findByText("This tenant name or slug is already taken."),
      ).toBeInTheDocument();
      expect(getCreateTenantBodies()).toHaveLength(1);

      // we should still be on the create tenants step
      expect(screen.getByPlaceholderText("Tenant name")).toBeVisible();
      expect(
        screen.queryByText("You created the following tenants"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Tenants created successfully"),
      ).not.toBeInTheDocument();
    });

    it("reloads with strategy pre-selected and 'Select data' step unlocked when RLS is configured", async () => {
      setup({
        checklist: RLS_CONFIGURED_CHECKLIST,
        strategy: "row-column-level-security",
      });

      await waitFor(() =>
        expect(getStep(STEP_TITLES.selectData)).toHaveAttribute(
          "data-completed",
          "true",
        ),
      );

      // positive control: a step that is still locked shows the lock icon
      expect(
        within(getStep(STEP_TITLES.summary)).getByLabelText("Locked"),
      ).toBeInTheDocument();
      expect(
        within(getStep(STEP_TITLES.selectData)).queryByLabelText("Locked"),
      ).not.toBeInTheDocument();

      await openStep(STEP_TITLES.dataSegregation);

      expect(
        screen.getByRole("radio", { name: /Row and column level security/ }),
      ).toBeChecked();
    });
  });

  describe("connection impersonation step", () => {
    it("creates a tenant with database_role attribute when using connection impersonation", async () => {
      setup({
        checklist: TENANTS_ENABLED_CHECKLIST,
        databases: [DATABASE_WITHOUT_IMPERSONATION],
      });

      await chooseStrategy(
        /Connection impersonation/,
        "Use connection impersonation",
      );

      expect(
        await screen.findByText(
          "None of your databases support connection impersonation. Pick a different data segregation strategy in the previous step, or connect a new database in the Database settings before proceeding. Metabase connects to more than 15 popular databases.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Add database" }),
      ).toHaveAttribute("href", "/admin/databases/create");

      await openStep(STEP_TITLES.createTenants);

      await fillTenant({
        index: 0,
        name: "Acme Corp",
        slug: "acme-corp",
        getAttributeInputs: () => screen.getAllByPlaceholderText("tenant_role"),
        attributeValue: "acme_role",
      });
      await submitTenants();
      await expectTenantsCreatedToast();

      expect(getCreateTenantBodies()).toEqual([
        {
          name: "Acme Corp",
          slug: "acme-corp",
          attributes: { database_role: "acme_role" },
        },
      ]);

      expect(
        getTextWithContent(
          "All users in Acme Corp will connect using the acme_role database role.",
        ),
      ).toBeVisible();
    });

    it("reopens the create tenants step after changing the segregation strategy", async () => {
      setup({
        checklist: {
          ...RLS_CONFIGURED_CHECKLIST,
          "create-tenants": true,
        },
        strategy: "row-column-level-security",
        strategyAfterPermissionsUpdate: "connection-impersonation",
        databases: [DATABASE_WITH_IMPERSONATION],
      });

      // the page settles on the summary step
      await waitFor(() =>
        expect(getStep(STEP_TITLES.summary)).toHaveAttribute(
          "aria-current",
          "step",
        ),
      );

      await openStep(STEP_TITLES.dataSegregation);
      await chooseStrategy(
        /Connection impersonation/,
        "Use connection impersonation",
      );

      // complete the new select-data step
      await userEvent.click(
        await screen.findByPlaceholderText("Pick a database"),
      );
      await userEvent.click(await screen.findByText("QA Postgres12"));
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await waitFor(() =>
        expect(
          fetchMock.callHistory.called("path:/api/permissions/graph", {
            method: "PUT",
          }),
        ).toBe(true),
      );

      // create tenants reopens instead of skipping to summary
      await waitFor(() =>
        expect(getStep(STEP_TITLES.createTenants)).toHaveAttribute(
          "aria-current",
          "step",
        ),
      );
      expect(getStep(STEP_TITLES.summary)).not.toHaveAttribute(
        "aria-current",
        "step",
      );

      // creating a new tenant should go to summary
      await fillTenant({
        index: 0,
        name: "Acme Corp",
        slug: "acme-corp",
        getAttributeInputs: () => screen.getAllByPlaceholderText("tenant_role"),
        attributeValue: "acme_role",
      });
      await submitTenants();
      await expectTenantsCreatedToast();

      await waitFor(() =>
        expect(getStep(STEP_TITLES.summary)).toHaveAttribute(
          "aria-current",
          "step",
        ),
      );
      expect(
        getTextWithContent(
          "All users in Acme Corp will connect using the acme_role database role.",
        ),
      ).toBeVisible();
    });
  });

  describe("database routing create tenants step", () => {
    it("creates a tenant with database_slug attribute when using database routing", async () => {
      setup({ checklist: TENANTS_ENABLED_CHECKLIST });

      await chooseStrategy(/Database routing/, "Use database routing");
      await openStep(STEP_TITLES.createTenants);

      await fillTenant({
        index: 0,
        name: "Acme Corp",
        slug: "acme-corp",
        getAttributeInputs: () =>
          screen.getAllByPlaceholderText("tenant-db-slug"),
        attributeValue: "acme-db",
      });
      await submitTenants();
      await expectTenantsCreatedToast();

      expect(getCreateTenantBodies()).toEqual([
        {
          name: "Acme Corp",
          slug: "acme-corp",
          attributes: { database_slug: "acme-db" },
        },
      ]);

      expect(
        getTextWithContent(
          "All users in Acme Corp will be routed to the acme-db database.",
        ),
      ).toBeVisible();
    });
  });

  describe("row-level security setup", () => {
    it("shows RLS data permissions description in summary", async () => {
      setup({
        checklist: TENANTS_ENABLED_CHECKLIST,
        databases: [RLS_DATABASE],
      });

      await chooseStrategy(
        /Row and column level security/,
        "Use row and column level security",
      );

      // pick Orders table and User ID column
      await userEvent.click(await screen.findByText("Pick a table"));
      await userEvent.click(await screen.findByText("QA Postgres12"));
      await userEvent.click(await screen.findByText("Orders"));

      await userEvent.click(screen.getByPlaceholderText("Pick a column"));
      await userEvent.click(await screen.findByText("User ID"));
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await openStep(STEP_TITLES.createTenants);

      // the description names the column picked in the previous step
      expect(
        getTextWithContent("Enter a value that matches the User ID column."),
      ).toBeVisible();

      await fillTenant({
        index: 0,
        name: "Acme Corp",
        slug: "acme-corp",
        getAttributeInputs: () => screen.getAllByPlaceholderText("e.g. 1"),
        attributeValue: "42",
      });
      await submitTenants();
      await expectTenantsCreatedToast();

      expect(
        getTextWithContent(
          "All users in Acme Corp can view rows in the Orders table where User ID field equals 42.",
        ),
      ).toBeVisible();
    });
  });
});
