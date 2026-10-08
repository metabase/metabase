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

interface SerializedResources {
  queries: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  metrics: unknown[];
}

const isObjectArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isObject);

function isSerializedResources(value: unknown): value is SerializedResources {
  return (
    isObject(value) &&
    isObjectArray(value.queries) &&
    isObjectArray(value.actions) &&
    Array.isArray(value.metrics)
  );
}

async function requestSerialization(
  appRoot: string,
  body: { collection: string; queries: unknown[]; actions: number[] },
): Promise<SerializedResources> {
  const { metabaseUrl, apiKey } = getMetabaseCredentials(appRoot);
  const response = await fetch(`${metabaseUrl}/api/apps/serialize-resources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `The serialization request failed (${response.status}): ${await response.text()}`,
    );
  }

  const serialized: unknown = await response.json();

  if (!isSerializedResources(serialized)) {
    throw new Error("The serialization response has an unexpected body.");
  }

  return serialized;
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
export async function serializeResources(appDirectory: string, file?: string) {
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

  const serialized = await requestSerialization(appRoot, {
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

  const serializedActions = new Map(
    serialized.actions.map((action) => [action.id, action]),
  );

  if (serialized.queries.length !== identified.length) {
    throw new Error(
      `The serialization response holds ${serialized.queries.length} queries; ${identified.length} were requested.`,
    );
  }

  const missingActions = actions
    .map(({ sourceActionId }) => sourceActionId)
    .filter((id) => !serializedActions.has(id));

  if (missingActions.length > 0) {
    throw new Error(
      `The serialization response is missing action ${missingActions.join(", ")}.`,
    );
  }

  return JSON.stringify(
    {
      queries: identified.map((query, index) => ({
        export: query.exportName,
        file: path.relative(appRoot, query.filePath),
        savedQuestionEntityId: query.savedQuestionEntityId,
        ...serialized.queries[index],
      })),
      actions: actions.map((action) => ({
        export: action.exportName,
        file: path.relative(appRoot, action.filePath),
        copiedActionEntityId: action.copiedActionEntityId ?? null,
        ...serializedActions.get(action.sourceActionId),
      })),
      metrics: serialized.metrics,
    },
    null,
    2,
  );
}
