import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  Card,
  CardQueryMetadata,
  Collection,
  Dashboard,
  DashboardQueryMetadata,
  Database,
  Dataset,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockDataset,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { setupDatabasesEndpoints } from "../server-mocks";
import { mockSettings } from "../settings";
import { type RenderWithProvidersOptions, renderWithProviders } from "../ui";

import { setupSavedCardScenario } from "./card";
import { setupCollectionsScenario } from "./collection";
import { createDashboardReduxState, setupDashboardScenario } from "./dashboard";
import {
  type EnterprisePluginName,
  setupEnterpriseScenario,
} from "./enterprise";

/**
 * Fluent builder that resolves transitive endpoint dependencies for a
 * test scenario. Chain `.withX()` calls, then `.render(ui, options?)`.
 *
 *   const { dashboard, card, render } = createScenario()
 *     .withSampleDatabase()
 *     .withCard({ name: "Orders by month" })
 *     .withDashboard({ tabs: 1 })
 *     .build();
 *
 *   await render(<DashboardApp />, { initialRoute: `/dashboard/${dashboard.id}` });
 *
 * Each `with*` call also returns the constructed entity so tests can
 * grab specific ones if they need to thread an id into a route or
 * assertion.
 */
class TestScenarioBuilder {
  databases: Database[] = [];
  cards: Card[] = [];
  dashboards: Dashboard[] = [];
  collections: Collection[] = [];
  private datasetByCardId = new Map<number, Dataset>();
  private cardMetadataByCardId = new Map<number, CardQueryMetadata>();
  private dashboardMetadataByDashId = new Map<
    Dashboard["id"],
    DashboardQueryMetadata
  >();
  private currentUser: User | null = null;
  private settingOverrides: Record<string, unknown> = {};
  private tokenFeatures: Partial<TokenFeatures> | null = null;
  private enterprisePlugins: EnterprisePluginName[] = [];
  private seedDashboardReduxFor: Dashboard | null = null;

  /**
   * Adds the standard sample database with its tables, schemas, and fields.
   */
  withSampleDatabase(): this {
    this.databases.push(createSampleDatabase());
    return this;
  }

  /**
   * Adds a database. Accepts:
   *   - `"sample"` — the standard sample database with its tables, schemas, fields.
   *   - A full `Database` object.
   */
  withDatabase(database: "sample" | Database): this {
    if (database === "sample") {
      this.databases.push(createSampleDatabase());
    } else {
      this.databases.push(database);
    }
    return this;
  }

  /**
   * Adds a saved card. Returns the constructed card so tests can grab
   * the id. Auto-wires query_metadata, query (if `dataset` provided),
   * alerts, and model-index endpoints at build time.
   */
  withCard(
    opts: Partial<Card> = {},
    options: { dataset?: Dataset; metadata?: CardQueryMetadata } = {},
  ): this {
    const card = createMockCard(opts);
    this.cards.push(card);
    if (options.dataset) {
      this.datasetByCardId.set(card.id, options.dataset);
    }
    if (options.metadata) {
      this.cardMetadataByCardId.set(card.id, options.metadata);
    }
    return this;
  }

  /**
   * Adds a dashboard. If `cards` is provided, wraps each card in a
   * dashcard slot and registers its endpoints. The dashboard's
   * query_metadata endpoint is wired at build time.
   */
  withDashboard(
    opts: Partial<Omit<Dashboard, "tabs">> & {
      /** Either an array of tabs or a number of tabs to auto-generate. */
      tabs?: Dashboard["tabs"] | number;
      /** Cards to embed as dashcards. Their endpoints are auto-wired. */
      cards?: Card[];
    } = {},
    options: { metadata?: DashboardQueryMetadata } = {},
  ): this {
    const { cards = [], tabs, ...dashboardOpts } = opts;
    const dashcards = cards.map((card, index) =>
      createMockDashboardCard({
        id: index + 1,
        card_id: card.id,
        card,
        size_x: 6,
        size_y: 4,
        col: (index % 2) * 6,
        row: Math.floor(index / 2) * 4,
      }),
    );
    const resolvedTabs =
      typeof tabs === "number"
        ? Array.from({ length: tabs }, (_, i) =>
            createMockDashboardTab({ id: i + 1, name: `Tab ${i + 1}` }),
          )
        : tabs;
    const dashboard = createMockDashboard({
      dashcards,
      tabs: resolvedTabs,
      ...dashboardOpts,
    });
    this.dashboards.push(dashboard);
    cards.forEach((card) => {
      if (!this.cards.includes(card)) {
        this.cards.push(card);
      }
    });
    if (options.metadata) {
      this.dashboardMetadataByDashId.set(dashboard.id, options.metadata);
    }
    return this;
  }

  /** Adds a collection that the test should expose via the collection endpoints. */
  withCollection(opts: Partial<Collection> = {}): this {
    this.collections.push(createMockCollection(opts));
    return this;
  }

  /** Sets the current user. Common shorthand: `.withAdminUser()`. */
  withUser(user: User | Partial<User>): this {
    this.currentUser = "id" in user ? (user as User) : createMockUser(user);
    return this;
  }

  withAdminUser(extra: Partial<User> = {}): this {
    return this.withUser({ ...extra, is_superuser: true });
  }

  /** Merges into the `settings` slice. Token features are layered on top. */
  withSettings(overrides: Record<string, unknown>): this {
    this.settingOverrides = { ...this.settingOverrides, ...overrides };
    return this;
  }

  /**
   * Loads enterprise-only plugin modules, registers the token-status
   * endpoint, and merges `token-features` into settings.
   */
  withEnterprise(
    options: {
      plugins?: EnterprisePluginName[];
      tokenFeatures?: Partial<TokenFeatures>;
    } = {},
  ): this {
    if (options.plugins) {
      this.enterprisePlugins.push(...options.plugins);
    }
    this.tokenFeatures = {
      ...(this.tokenFeatures ?? {}),
      ...(options.tokenFeatures ?? {}),
    };
    return this;
  }

  /**
   * Pre-seeds the `dashboard` Redux slice with the given dashboard so
   * components that read directly from state (e.g. `DashboardHeader`)
   * mount with the right ids and dashcards-by-id mapping.
   */
  withDashboardReduxState(dashboard?: Dashboard): this {
    this.seedDashboardReduxFor = dashboard ?? this.dashboards[0] ?? null;
    return this;
  }

  /**
   * Wires up all endpoints derived from the accumulated entities and
   * returns a stable handle: the entity arrays, plus a `render()` that
   * mounts a UI tree with `renderWithProviders`.
   */
  build() {
    if (this.databases.length > 0) {
      setupDatabasesEndpoints(this.databases);
    }
    if (this.collections.length > 0) {
      setupCollectionsScenario({ collections: this.collections });
    }
    this.cards.forEach((card) => {
      const dataset = this.datasetByCardId.get(card.id) ?? createMockDataset();
      const metadata =
        this.cardMetadataByCardId.get(card.id) ??
        createMockCardQueryMetadata({ databases: this.databases });
      setupSavedCardScenario({ card, dataset, metadata });
    });
    this.dashboards.forEach((dashboard) => {
      const metadata =
        this.dashboardMetadataByDashId.get(dashboard.id) ??
        createMockDashboardQueryMetadata({ databases: this.databases });
      setupDashboardScenario({ dashboard, metadata });
    });

    // Settings must be set BEFORE enterprise plugins load — `initializePlugin`
    // calls `hasPremiumFeature` at load time, which reads from the
    // `MetabaseSettings` global that `mockSettings` sets as a side effect.
    const enterpriseSettingsFragment: { "token-features"?: TokenFeatures } =
      this.tokenFeatures !== null
        ? {
            "token-features": createMockTokenFeatures(this.tokenFeatures),
          }
        : {};
    const settingsState =
      this.tokenFeatures !== null ||
      Object.keys(this.settingOverrides).length > 0
        ? mockSettings({
            ...enterpriseSettingsFragment,
            ...this.settingOverrides,
          })
        : undefined;
    if (this.enterprisePlugins.length > 0 || this.tokenFeatures !== null) {
      setupEnterpriseScenario({
        plugins: this.enterprisePlugins,
        tokenFeatures: this.tokenFeatures ?? {},
      });
    }

    const baseStoreState: Partial<State> = {};
    if (this.currentUser) {
      baseStoreState.currentUser = this.currentUser;
    }
    if (settingsState) {
      baseStoreState.settings = settingsState;
    }
    if (this.seedDashboardReduxFor) {
      baseStoreState.dashboard = createDashboardReduxState(
        this.seedDashboardReduxFor,
      );
    }

    const dashboard = this.dashboards[0];
    const card = this.cards[0];
    const database = this.databases[0];
    const collection = this.collections[0];

    return {
      databases: this.databases,
      cards: this.cards,
      dashboards: this.dashboards,
      collections: this.collections,
      database,
      card,
      dashboard,
      collection,
      render: (
        ui: React.ReactElement,
        options: RenderWithProvidersOptions = {},
      ) =>
        renderWithProviders(ui, {
          ...options,
          storeInitialState: createMockState({
            ...baseStoreState,
            ...(options.storeInitialState ?? {}),
          }),
        }),
    };
  }
}

/**
 * Entry point for the fluent scenario builder.
 *
 * @see TestScenarioBuilder
 */
export function createScenario() {
  return new TestScenarioBuilder();
}
