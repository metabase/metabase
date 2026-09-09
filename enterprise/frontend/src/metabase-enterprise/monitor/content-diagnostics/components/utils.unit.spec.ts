import type { CollectionNamespace } from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsDuplicateEntity,
  createMockContentDiagnosticsStaleFinding,
} from "metabase-types/api/mocks";

import type {
  ImbalancedContentFilterOptions,
  SlowContentFilterOptions,
  StaleContentFilterOptions,
} from "./types";
import {
  getBreadcrumbLinks,
  getChangedFilterDimension,
  getDuplicateEntityUrl,
  getEntityUrl,
} from "./utils";

describe("getEntityUrl", () => {
  it.each([
    ["question", /^\/question\/10\b/],
    ["model", /^\/model\/10\b/],
    ["metric", /^\/metric\/10\b/],
  ] as const)("points a %s at its own route", (cardType, expected) => {
    const url = getEntityUrl(
      createMockContentDiagnosticsStaleFinding({
        entity_type: "card",
        card_type: cardType,
        entity_id: 10,
      }),
    );

    expect(url).toMatch(expected);
  });

  it("falls back to the question route for a card of unknown kind", () => {
    const url = getEntityUrl(
      createMockContentDiagnosticsStaleFinding({
        entity_type: "card",
        card_type: null,
        entity_id: 10,
      }),
    );

    expect(url).toMatch(/^\/question\/10\b/);
  });

  it.each([
    ["dashboard", /^\/dashboard\/10\b/],
    ["document", /^\/document\/10\b/],
  ] as const)("points a %s at its own route", (entityType, expected) => {
    const url = getEntityUrl(
      createMockContentDiagnosticsStaleFinding({
        entity_type: entityType,
        card_type: null,
        entity_id: 10,
      }),
    );

    expect(url).toMatch(expected);
  });

  it("points a transform at the Data Studio transform route", () => {
    const url = getEntityUrl(
      createMockContentDiagnosticsStaleFinding({
        entity_type: "transform",
        card_type: null,
        entity_id: 10,
      }),
    );

    expect(url).toBe("/data-studio/transforms/10");
  });
});

describe("getDuplicateEntityUrl", () => {
  it("routes a peer by its own kind rather than the finding's", () => {
    const url = getDuplicateEntityUrl(
      createMockContentDiagnosticsDuplicateEntity({
        id: 11,
        entity_type: "card",
        card_type: "model",
      }),
    );

    expect(url).toMatch(/^\/model\/11\b/);
  });
});

describe("getBreadcrumbLinks", () => {
  it("shows the root collection when the entity has no collection", () => {
    const links = getBreadcrumbLinks(
      createMockContentDiagnosticsStaleFinding({
        details: { collection: null },
      }),
    );

    expect(links).toEqual([
      {
        id: "root",
        label: "Our analytics",
        url: "/collection/root",
        icon: "folder",
      },
    ]);
  });

  it("lists the ancestors before the collection itself, with a folder icon only on the first", () => {
    const links = getBreadcrumbLinks(
      createMockContentDiagnosticsStaleFinding({
        details: {
          collection: createMockContentDiagnosticsCollection({
            id: 3,
            name: "Reports",
            effective_ancestors: [
              { id: "root", name: "Our analytics" },
              { id: 2, name: "Finance" },
            ],
          }),
        },
      }),
    );

    expect(links.map((link) => link.label)).toEqual([
      "Our analytics",
      "Finance",
      "Reports",
    ]);
    expect(links.map((link) => link.icon)).toEqual([
      "folder",
      undefined,
      undefined,
    ]);
    expect(links[2].url).toMatch(/^\/collection\/3\b/);
  });

  it("links a collection by its namespace, not by the kind of entity in it", () => {
    const collection = createMockContentDiagnosticsCollection({
      id: 4,
      name: "Nightly",
    });
    const linkFor = (namespace: CollectionNamespace) =>
      getBreadcrumbLinks(
        createMockContentDiagnosticsStaleFinding({
          details: { collection: { ...collection, namespace } },
        }),
      )[0].url;

    expect(linkFor("transforms")).toBe(
      "/data-studio/transforms?collectionId=4",
    );
    expect(linkFor(null)).toMatch(/^\/collection\/4\b/);
  });
});

const BASE_OPTIONS: ImbalancedContentFilterOptions = {
  entityTypes: ["question", "dashboard"],
  includePersonalCollections: false,
};

const STALE_OPTIONS: StaleContentFilterOptions = {
  entityTypes: ["question", "dashboard"],
  includePersonalCollections: false,
  thresholdDays: 30,
};

const SLOW_OPTIONS: SlowContentFilterOptions = {
  entityTypes: ["question", "dashboard"],
  includePersonalCollections: false,
  minDurationMs: 1000,
};

describe("getChangedFilterDimension", () => {
  it("reports an entity type being dropped", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["question"],
      }),
    ).toBe("entity_type");
  });

  it("reports an entity type being added", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["question", "dashboard", "document"],
      }),
    ).toBe("entity_type");
  });

  it("reports the personal collections toggle", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        includePersonalCollections: true,
      }),
    ).toBe("personal_collections");
  });

  it("reports whichever numeric threshold the tab owns", () => {
    expect(
      getChangedFilterDimension(STALE_OPTIONS, {
        ...STALE_OPTIONS,
        thresholdDays: 90,
      }),
    ).toBe("threshold");

    expect(
      getChangedFilterDimension(SLOW_OPTIONS, {
        ...SLOW_OPTIONS,
        minDurationMs: 5000,
      }),
    ).toBe("threshold");
  });

  it("reports a threshold that was cleared", () => {
    expect(
      getChangedFilterDimension(STALE_OPTIONS, {
        ...STALE_OPTIONS,
        thresholdDays: undefined,
      }),
    ).toBe("threshold");
  });

  it("reports a threshold that was set where there was none", () => {
    expect(
      getChangedFilterDimension(
        { ...STALE_OPTIONS, thresholdDays: undefined },
        STALE_OPTIONS,
      ),
    ).toBe("threshold");
  });

  it("returns null when nothing changed, so no event is sent", () => {
    expect(getChangedFilterDimension(STALE_OPTIONS, { ...STALE_OPTIONS })).toBe(
      null,
    );
  });

  it("does not mistake entity type order for a change", () => {
    expect(
      getChangedFilterDimension(BASE_OPTIONS, {
        ...BASE_OPTIONS,
        entityTypes: ["dashboard", "question"],
      }),
    ).toBeNull();
  });
});
