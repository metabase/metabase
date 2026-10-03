/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/maps.cy.spec.js
 *
 * Leaflet-based pin / region / grid map coverage: viz selection, marker
 * rendering + tooltips, zoom/pan persistence across resize, region drill-through,
 * tile requests, and pin-map brush filters.
 *
 * Porting notes:
 * - Cypress `.trigger("mousemove")` on a marker/region/grid cell → a synthetic
 *   MouseEvent dispatch (dispatchEvent("mousemove")), NOT a real hover — that is
 *   the faithful equivalent (see PORTING.md wave-13 note on chart tooltips).
 * - `.realHover().realMouseWheel({ deltaY })` → hover() (parks the real cursor)
 *   then page.mouse.wheel().
 * - `H.visitQuestionAdhoc` (query type) → visitQuestionAdhoc (permissions.ts);
 *   the native-autorun branch (#8362) → visitNativeQuestionAdhoc (charts-extras).
 * - `H.createNativeQuestion(details, { visitQuestion: true })` →
 *   createNativeQuestion(api, details) + visitQuestion(page, id).
 * - Spec-local helpers (toggleFieldSelectElement, zoomIn, getSettledMarkerPosition,
 *   pinMapSelectRegion) live in support/maps.ts.
 */
import { createNativeQuestion } from "../support/factories";
import { leftSidebar, tooltip } from "../support/charts";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { test, expect } from "../support/fixtures";
import {
  getSettledMarkerPosition,
  pinMapSelectRegion,
  toggleFieldSelectElement,
  zoomIn,
} from "../support/maps";
import { runNativeQuery } from "../support/models";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { icon, popover, visitQuestion } from "../support/ui";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > maps", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display a pin map for a native query", async ({ page, mb }) => {
    await mb.signInAsNormalUser();

    // create a native query with lng/lat fields
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select -80 as lng, 40 as lat union all select -120 as lng, 40 as lat",
    );
    await runNativeQuery(page);

    // switch to a pin map visualization
    await page.getByText("Visualization", { exact: true }).first().click();
    await leftSidebar(page).getByTestId("more-charts-toggle").click();
    await icon(leftSidebar(page), "pinmap").click();

    await icon(page.getByTestId("Map-container"), "gear").click();

    await toggleFieldSelectElement(page, "Map type");
    await popover(page).getByText("Pin map", { exact: true }).click();

    // When the settings sidebar opens, both latitude and longitude selects are
    // open. That makes it difficult to select each, so we click inside both of
    // them before reopening them one-by-one (metabase#18063).
    for (const field of ["Latitude field", "Longitude field"]) {
      await toggleFieldSelectElement(leftSidebar(page), field);
    }

    // select both columns
    await toggleFieldSelectElement(leftSidebar(page), "Latitude field");
    await popover(page).getByText("LAT", { exact: true }).click();

    await toggleFieldSelectElement(leftSidebar(page), "Longitude field");
    await popover(page).getByText("LNG", { exact: true }).click();

    // check that a map appears
    await expect(page.locator(".leaflet-container")).toBeVisible();
  });

  test("should suggest map visualization regardless of the first column type (metabase#14254)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "14254",
      native: {
        query:
          'SELECT "PUBLIC"."PEOPLE"."LONGITUDE" AS "LONGITUDE", "PUBLIC"."PEOPLE"."LATITUDE" AS "LATITUDE", "PUBLIC"."PEOPLE"."CITY" AS "CITY"\nFROM "PUBLIC"."PEOPLE"\nLIMIT 10',
        "template-tags": {},
      },
      display: "map",
      visualization_settings: {
        "map.region": "us_states",
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });
    await visitQuestion(page, id);

    await page.getByRole("button", { name: "Visualization" }).click();

    await expect(
      page.getByTestId("chart-type-settings").getByText("Map", { exact: true }),
    ).toBeVisible();
  });

  test("should wrap markers around the international date line correctly (metabase#5369)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "friends across time",
      native: {
        query: `
            SELECT 'Kleavor' as name, 68 as lat, -159 as lng
            UNION ALL
            SELECT 'Spectrier' as name, 68 as lat, 159 as lng
            UNION ALL
            SELECT 'Blastoise' as name, 68 as lat, 22 as lng
          `,
        "template-tags": {},
      },
      display: "map",
      visualization_settings: {
        "map.region": "world",
        "map.type": "pin",
        "map.latitude_column": "LAT",
        "map.longitude_column": "LNG",
        "map.center_latitude": 67,
        "map.center_longitude": -175,
        "map.zoom": 1,
      },
    });
    await visitQuestion(page, id);

    const markers = page.locator(".leaflet-marker-icon");

    // should draw 6 markers
    await expect(markers).toHaveCount(6);

    // zooming should preserve tooltips (metabase#64939)
    // Blastoise in Sweden is the third marker
    await markers.nth(2).hover();
    await page.mouse.wheel(0, -100);

    // this waits until we redraw from 6 to 3
    await expect(markers).toHaveCount(3);

    await markers.nth(2).dispatchEvent("mousemove");
    await expect(
      tooltip(page).getByText("Blastoise", { exact: true }),
    ).toBeVisible();
  });

  test("should preserve zoom and pan after resize (metabase#11211)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 600 });

    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          limit: 999,
        },
      },
      display: "map",
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
        "map.center_latitude": 40,
        "map.center_longitude": -100,
        "map.zoom": 4,
      },
    });

    await zoomIn(page, 4);

    // Compare two settled marker positions instead of racing leaflet's
    // zoom/resize animation with a fixed wait — mid-animation reads are the
    // flake (metabase#11211).
    const posAfterZoom = await getSettledMarkerPosition(page);

    // 1px resize should not reset zoom
    await page.setViewportSize({ width: 801, height: 600 });

    const posAfterResize = await getSettledMarkerPosition(page);

    // Position should be nearly identical (within 5px tolerance)
    const tolerance = 5;
    expect(Math.abs(posAfterResize.left - posAfterZoom.left)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(posAfterResize.top - posAfterZoom.top)).toBeLessThanOrEqual(
      tolerance,
    );
  });

  test("should not assign the full name of the state as the filter value on a drill-through (metabase#14650)", async ({
    page,
  }) => {
    const geojsonResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith("/app/assets/geojson/"),
    );

    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.STATE, null]],
        },
        type: "query",
      },
      display: "map",
      visualization_settings: {
        "map.type": "region",
        "map.region": "us_states",
      },
    });

    await geojsonResponse;

    const texas = page.locator(".CardVisualization svg path").nth(22);
    await expect(texas).toBeVisible();

    // hover to see the tooltip
    await texas.dispatchEvent("mousemove");

    // check tooltip content
    await expect(page.getByText("State:", { exact: true })).toBeVisible(); // column name key
    await expect(page.getByText("Texas", { exact: true })).toBeVisible(); // feature name as value

    // open drill-through menu and drill within it
    const datasetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await texas.click();
    await page.getByText(/See these People/i).click();

    // Reported as a regression since v0.37.0
    await datasetResponse;
    await expect(page.getByText("State is TX", { exact: true })).toBeVisible();
    await expect(
      page.getByText("171 Olive Oyle Lane", { exact: true }),
    ).toBeVisible(); // Address in the first row
  });

  test("should display pins when a breakout column sets a base-type (metabase#59984)", async ({
    page,
  }) => {
    const tilesResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith("/api/tiles/"),
    );

    await visitQuestionAdhoc(page, {
      display: "map",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: ["count"],
          breakout: [
            ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }],
            ["field", PEOPLE.LATITUDE, { "base-type": "type/Float" }],
          ],
        },
      },
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });

    // this should not create a 400 error
    const tiles = await tilesResponse;
    expect(tiles.status()).toBe(200);
  });

  test("should display a tooltip for a grid map without a metric column (metabase#17940)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "map",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          breakout: [
            ["field", PEOPLE.LONGITUDE, { binning: { strategy: "default" } }],
            ["field", PEOPLE.LATITUDE, { binning: { strategy: "default" } }],
          ],
          limit: 1,
        },
      },
      visualization_settings: {
        "map.type": "grid",
        "table.pivot_column": "LATITUDE",
        "table.cell_column": "LONGITUDE",
      },
    });

    await page.locator(".leaflet-interactive").first().dispatchEvent("mousemove");

    await expect(
      page.getByText("Latitude: 10°:", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Longitude: 10°:", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1", { exact: true })).toBeVisible();
  });

  test("should render grid map visualization for native questions (metabase#8362)", async ({
    page,
  }) => {
    await visitNativeQuestionAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query: `
              select 20 as "Latitude", -110 as "Longitude", 1 as "metric" union all
              select 70 as "Latitude", -170 as "Longitude", 5 as "metric"
            `,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "map",
      visualization_settings: {
        "map.type": "grid",
        "map.latitude_column": "Latitude",
        "map.longitude_column": "Longitude",
        "map.metric_column": "metric",
      },
    });

    // Ensure chart is rendered
    await expect(page.locator(".leaflet-interactive").first()).toBeVisible();

    await page.getByText("Visualization", { exact: true }).first().click();

    await expect(
      page.getByTestId("chart-type-settings").getByTestId("Map-button"),
    ).toBeVisible();
  });

  test("should display pins type viz setting (metabase#40999)", async ({
    page,
  }) => {
    const tilesResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith("/api/tiles/"),
    );

    await visitQuestionAdhoc(page, {
      display: "map",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: ["count"],
          breakout: [
            ["field", PEOPLE.LONGITUDE, { "base-type": "type/Float" }],
            ["field", PEOPLE.LATITUDE, { "base-type": "type/Float" }],
          ],
        },
      },
      visualization_settings: {
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      },
    });

    await tilesResponse;

    await page.getByTestId("viz-settings-button").click();

    await expect(
      leftSidebar(page).getByText("Pin type", { exact: true }),
    ).toBeVisible();

    await leftSidebar(page).getByLabel("Pin type").click();
    await popover(page).getByText("Markers", { exact: true }).click();

    // cy.get(".leaflet-marker-icon") resets to the document root (Cypress .get
    // ignores the prior subject), so this is an unscoped page-wide count.
    await expect
      .poll(() => page.locator(".leaflet-marker-icon").count())
      .toBeGreaterThan(10);
  });

  test.describe("Pin Map brush filters", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("should apply brush filters by dragging map", async ({ page }) => {
      await pinMapSelectRegion(page, 500, 500, 600, 600, {
        "map.region": "us_states",
        "map.type": "pin",
        "map.latitude_column": "LATITUDE",
        "map.longitude_column": "LONGITUDE",
      });
      await expect(page.locator(".CardVisualization").first()).toBeAttached();
      // selecting area at the map provides different filter values, so the
      // simplified assertion is used
      await expect(page.getByTestId("filter-pill")).toHaveCount(1);
    });

    test("should apply brush filters by dragging map when zoomed out (metabase#41056)", async ({
      page,
    }) => {
      await pinMapSelectRegion(page, 250, 150, 500, 250);
      await expect(page.locator(".CardVisualization").first()).toBeAttached();
      await expect(page.getByTestId("filter-pill")).toHaveCount(1);
    });

    test("should handle brush filters that select zero data points (metabase#41056)", async ({
      page,
    }) => {
      await pinMapSelectRegion(page, 10, 10, 20, 20);
      await expect(page.locator(".CardVisualization")).toHaveCount(0);
      await expect(
        page.getByTestId("question-row-count").getByText("Showing 0 rows", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("filter-pill")).toHaveCount(1);
    });

    test("should handle brush filters that exceed 360 deg of longitude (metabase#41056)", async ({
      page,
    }) => {
      await pinMapSelectRegion(page, 10, 10, 1270, 600);
      await expect(page.locator(".CardVisualization").first()).toBeAttached();
      await expect(
        page.getByTestId("question-row-count").getByText("Showing first 2,000 rows", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByTestId("filter-pill")).toHaveCount(1);
      await expect(page.getByTestId("filter-pill")).toContainText(
        "Longitude is between -180 and 180",
      );
    });
  });
});
