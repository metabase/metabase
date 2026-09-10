// Rules every generator must satisfy. Returns human-readable violations; the
// contract unit test expects [] for every registered generator × every fixture
// catalog.
import { AVAILABLE_DISPLAYS_BY_TYPE } from "./shared";
import type {
  CardGenerator,
  CubeCard,
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  CubeDimensionKey,
  CubeMeasure,
} from "./types";

interface CatalogIndex {
  measureById: Map<CubeMeasure["id"], CubeMeasure>;
  dimensionByKey: Map<CubeDimensionKey, CubeDimension>;
  segmentIds: Set<number>;
}

export function getContractViolations(
  generator: CardGenerator,
  catalog: CubeCatalog,
  settingsOverride?: CubeCoarseSettings,
): string[] {
  const violations: string[] = [];
  const fail = (message: string) =>
    violations.push(`[${generator.id}] ${message}`);

  const index: CatalogIndex = {
    measureById: new Map(catalog.measures.map((m) => [m.id, m])),
    dimensionByKey: new Map(catalog.dimensions.map((d) => [d.key, d])),
    segmentIds: new Set(catalog.segments.map((s) => s.id)),
  };

  const defaults = generator.getDefaultSettings(catalog);
  checkDefaultSettings(defaults, catalog, index, fail);

  const settings = settingsOverride ?? defaults;
  const cards = generator.generateCards(catalog, settings);
  const again = generator.generateCards(catalog, settings);
  if (JSON.stringify(cards) !== JSON.stringify(again)) {
    fail("not deterministic");
  }

  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) {
      fail(`card ${card.id}: duplicate id`);
    }
    ids.add(card.id);
    checkCard(card, settings, index, fail);
  }

  return violations;
}

function checkDefaultSettings(
  defaults: CubeCoarseSettings,
  catalog: CubeCatalog,
  { measureById, dimensionByKey }: CatalogIndex,
  fail: (message: string) => void,
) {
  if (catalog.measures.length > 0 && defaults.measureIds.length === 0) {
    fail("default settings select no measures");
  }
  for (const id of defaults.measureIds) {
    if (!measureById.has(id)) {
      fail(`default settings: unknown measure ${id}`);
    }
  }
  for (const key of [
    ...defaults.dimensionKeys,
    ...defaults.filterDimensionKeys,
  ]) {
    if (!dimensionByKey.has(key)) {
      fail(`default settings: unknown dimension ${key}`);
    }
  }
}

function checkCard(
  card: CubeCard,
  settings: CubeCoarseSettings,
  { measureById, dimensionByKey, segmentIds }: CatalogIndex,
  fail: (message: string) => void,
) {
  const where = `card ${card.id}`;

  if (card.kind === "custom") {
    fail(`${where}: generators must not emit "custom"`);
  }
  if (card.series.length === 0) {
    fail(`${where}: no series`);
  }
  if (card.dimensionKeys.length > 2) {
    fail(`${where}: more than 2 dimensions`);
  }
  if (new Set(card.series.map((s) => s.measureId)).size > 1) {
    fail(`${where}: mixes measures`);
  }
  if (card.dimensionKeys.length === 2) {
    if (card.series.length !== 1) {
      fail(`${where}: 2 dimensions need exactly 1 series`);
    }
    const second = dimensionByKey.get(card.dimensionKeys[1]);
    if (second && second.type !== "category" && second.type !== "boolean") {
      fail(`${where}: second dimension must be category or boolean`);
    }
  }

  for (const entry of card.series) {
    const measure = measureById.get(entry.measureId);
    if (!measure) {
      fail(`${where}: unknown measure ${entry.measureId}`);
      continue;
    }
    if (!settings.measureIds.includes(entry.measureId)) {
      fail(`${where}: measure ${entry.measureId} not in settings`);
    }
    for (const id of entry.segmentIds) {
      if (!segmentIds.has(id)) {
        fail(`${where}: unknown segment ${id}`);
      }
    }
    for (const key of card.dimensionKeys) {
      if (measure.dimensionIds[key] == null) {
        fail(`${where}: measure ${measure.id} lacks dimension ${key}`);
      }
    }
  }

  for (const key of card.dimensionKeys) {
    if (!settings.dimensionKeys.includes(key)) {
      fail(`${where}: dimension ${key} not in settings`);
    }
  }

  const [firstKey] = card.dimensionKeys;
  const first = firstKey != null ? dimensionByKey.get(firstKey) : undefined;
  const type = card.dimensionKeys.length === 0 ? "scalar" : first?.type;
  if (type && !AVAILABLE_DISPLAYS_BY_TYPE[type].includes(card.display)) {
    fail(`${where}: display ${card.display} not valid for ${type}`);
  }
}
