import type { DataApp } from "metabase-types/api";

import type { DataAppSimulation } from "./use-discovery-variant";

function createFakeDataApp(
  id: number,
  slug: string,
  name: string,
  updatedAt: string,
): DataApp {
  return {
    id,
    entity_id: `prototype-fake-data-app-${id}`,
    slug,
    name,
    description: null,
    version: 1,
    outdated: false,
    bundle_path: "dist/index.js",
    enabled: true,
    resource_collection_id: id,
    allowed_hosts: [],
    bundle_hash: null,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

// PROTOTYPE: mocked — the apps shown while the picker simulates an instance that has data apps. Negative ids keep
// them clear of real apps.
const FAKE_DATA_APPS: DataApp[] = [
  createFakeDataApp(
    -1,
    "store-explorer",
    "Store Explorer",
    "2026-11-24T16:42:00Z",
  ),
  createFakeDataApp(
    -2,
    "refund-review-queue",
    "Refund review queue",
    "2026-11-21T09:15:00Z",
  ),
  createFakeDataApp(
    -3,
    "inventory-desk",
    "Inventory desk",
    "2026-11-18T13:03:00Z",
  ),
  createFakeDataApp(
    -4,
    "supplier-portal",
    "Supplier portal",
    "2026-11-12T11:27:00Z",
  ),
  createFakeDataApp(
    -5,
    "pricing-requests",
    "Pricing requests",
    "2026-11-05T15:50:00Z",
  ),
];

/** The data apps a page should show under the picker's simulation: the fake ones, none, or the real ones. */
export function getSimulatedDataApps(
  simulation: DataAppSimulation,
  realDataApps: DataApp[],
): DataApp[] {
  if (simulation === "five") {
    return FAKE_DATA_APPS;
  }
  return simulation === "none" ? [] : realDataApps;
}
