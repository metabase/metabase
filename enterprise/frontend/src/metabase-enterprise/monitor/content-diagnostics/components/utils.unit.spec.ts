import type { CollectionNamespace } from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsDuplicateEntity,
  createMockContentDiagnosticsStaleFinding,
} from "metabase-types/api/mocks";

import {
  getBreadcrumbLinks,
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
