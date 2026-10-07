import path from "node:path";

import { readManifest } from "../data-app-dev/config/read-manifest";

import {
  QUERY_DEFINITIONS,
  discoverActions,
  discoverQueries,
  getRelativeDefinitionLocation,
} from "./discover";
import { getMetabaseCredentials } from "./env";
import { isObject } from "./guards";
import { COLLECTIONS_DIR } from "./resources";
import type { DiscoveredQuery } from "./types";

type IdentifiedQuery = DiscoveredQuery & { savedQuestionEntityId: string };

const isIdentified = (query: DiscoveredQuery): query is IdentifiedQuery =>
  query.savedQuestionEntityId !== undefined;

interface ExportedResources {
  queries: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  metrics: unknown[];
}

const isObjectArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isObject);

function isExportedResources(value: unknown): value is ExportedResources {
  return (
    isObject(value) &&
    isObjectArray(value.queries) &&
    isObjectArray(value.actions) &&
    Array.isArray(value.metrics)
  );
}

async function requestExport(
  appRoot: string,
  body: { collection: string; queries: unknown[]; actions: number[] },
): Promise<ExportedResources> {
  const { metabaseUrl, apiKey } = getMetabaseCredentials(appRoot);
  const response = await fetch(`${metabaseUrl}/api/apps/export-resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `The export request failed (${response.status}): ${await response.text()}`,
    );
  }

  const exported: unknown = await response.json();

  if (!isExportedResources(exported)) {
    throw new Error("The export response has an unexpected body.");
  }

  return exported;
}

/**
 * What the files of the app's collection are written from, as JSON, for the
 * definitions in `file` (relative to the app root, as files are printed) or
 * every definition: the saved question Metabase writes for each `defineQuery`
 * definition, in the collection `data_app.yaml` names and with the
 * definition's entity ID, each `defineAction`'s action, and the metrics the
 * queries aggregate, all as serialization writes them.
 * One request to the Metabase instance and API key in `.env.local`.
 */
export async function exportResources(appDirectory: string, file?: string) {
  const appRoot = path.resolve(appDirectory);
  const filePath = file === undefined ? undefined : path.resolve(appRoot, file);
  const queries = await discoverQueries(appRoot, { filePath });
  const actions = await discoverActions(appRoot, { filePath });

  if (filePath !== undefined && queries.length + actions.length === 0) {
    throw new Error(
      `${path.relative(appRoot, filePath)} has no defineQuery or defineAction definitions.`,
    );
  }

  const collection = readManifest(appRoot)?.manifest.collection;

  if (collection === undefined) {
    throw new Error(
      `No data_app.yaml in ${appRoot} names the app's collection. Write the collection under ${COLLECTIONS_DIR}/ and name its entity ID as \`collection\` first: the saved questions are written into it.`,
    );
  }

  // The saved question is printed with the definition's entity ID, so the file is complete as printed.
  const unidentified = queries.filter((query) => !isIdentified(query));

  if (unidentified.length > 0) {
    throw new Error(
      unidentified
        .map(
          (query) =>
            `${getRelativeDefinitionLocation(appRoot, query)} has no savedQuestionEntityId. Generate one with \`npx representations generate-entity-id\` and set it first: its saved question is printed with it.`,
        )
        .join("\n"),
    );
  }

  const identified = queries.filter(isIdentified);

  const exported = await requestExport(appRoot, {
    collection,
    queries: identified.map(({ exportName, query, savedQuestionEntityId }) => {
      const { [QUERY_DEFINITIONS.idKey]: _entityId, ...definition } = query;
      return {
        export: exportName,
        entity_id: savedQuestionEntityId,
        query: { stages: [definition] },
      };
    }),
    actions: actions.map(({ sourceActionId }) => sourceActionId),
  });

  const exportedActions = new Map(
    exported.actions.map((action) => [action.id, action]),
  );

  if (exported.queries.length !== identified.length) {
    throw new Error(
      `The export response holds ${exported.queries.length} queries; ${identified.length} were requested.`,
    );
  }

  const missingActions = actions
    .map(({ sourceActionId }) => sourceActionId)
    .filter((id) => !exportedActions.has(id));

  if (missingActions.length > 0) {
    throw new Error(
      `The export response is missing action ${missingActions.join(", ")}.`,
    );
  }

  return JSON.stringify(
    {
      queries: identified.map((query, index) => ({
        export: query.exportName,
        file: path.relative(appRoot, query.filePath),
        savedQuestionEntityId: query.savedQuestionEntityId,
        ...exported.queries[index],
      })),
      actions: actions.map((action) => ({
        export: action.exportName,
        file: path.relative(appRoot, action.filePath),
        copiedActionEntityId: action.copiedActionEntityId ?? null,
        ...exportedActions.get(action.sourceActionId),
      })),
      metrics: exported.metrics,
    },
    null,
    2,
  );
}
