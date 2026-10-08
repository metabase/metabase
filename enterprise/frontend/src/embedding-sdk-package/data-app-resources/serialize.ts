import fs from "node:fs";
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
import { COLLECTIONS_DIR, readResources, repoRootOf } from "./resources";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

type SerializedFile = { file: string; yaml: string } | { error: string };

interface SerializedResources {
  queries: SerializedFile[];
  actions: SerializedFile[];
  metrics: SerializedFile[];
}

const isSerializedFile = (value: unknown): value is SerializedFile =>
  isObject(value) &&
  ((typeof value.file === "string" && typeof value.yaml === "string") ||
    typeof value.error === "string");

const isSerializedFiles = (value: unknown): value is SerializedFile[] =>
  Array.isArray(value) && value.every(isSerializedFile);

function isSerializedResources(value: unknown): value is SerializedResources {
  return (
    isObject(value) &&
    isSerializedFiles(value.queries) &&
    isSerializedFiles(value.actions) &&
    isSerializedFiles(value.metrics)
  );
}

export function exportNameToCardName(exportName: string) {
  const words = exportName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\s_]+/g, " ")
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function requestSerialization(
  appRoot: string,
  body: { queries: unknown[]; actions: unknown[] },
): Promise<SerializedResources> {
  const { metabaseUrl, apiKey } = getMetabaseCredentials(appRoot);
  const response = await fetch(`${metabaseUrl}/api/apps/serialize`, {
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

function missingEntityIds(
  appRoot: string,
  queries: DiscoveredQuery[],
  actions: DiscoveredAction[],
) {
  return [
    ...queries
      .filter((query) => query.savedQuestionEntityId === undefined)
      .map(
        (query) =>
          `${getRelativeDefinitionLocation(appRoot, query)} has no savedQuestionEntityId. Generate one with \`npx representations generate-entity-id\` and set it first: its saved question is written with it.`,
      ),
    ...actions
      .filter((action) => action.copiedActionEntityId === undefined)
      .map(
        (action) =>
          `${getRelativeDefinitionLocation(appRoot, action)} has no copiedActionEntityId. Generate one with \`npx representations generate-entity-id\` and set it first: its copy is written with it.`,
      ),
  ];
}

function collectionDirectory(appRoot: string, collection: string) {
  const { repoRoot, collectionPath, files } = readResources(
    appRoot,
    collection,
  );

  if (collectionPath === undefined) {
    throw new Error(
      `No file under ${COLLECTIONS_DIR}/ holds the collection ${collection} that data_app.yaml names. Write it first: the files are written next to it.`,
    );
  }

  return {
    directory: path.join(repoRoot, collectionPath.replace(/\.yaml$/, "")),
    existing: files.map((file) => path.join(repoRoot, file.path)),
  };
}

function writeFile(directory: string, file: { file: string; yaml: string }) {
  const target = path.join(directory, file.file);

  if (path.dirname(target) !== directory) {
    throw new Error(
      `The serialization holds a file outside the collection: ${file.file}`,
    );
  }

  fs.writeFileSync(target, file.yaml);

  return target;
}

/**
 * Regenerates the files of the app's collection: the saved question Metabase
 * builds for each `defineQuery` definition, the copy of each `defineAction`'s
 * action, and the copies of the metrics the queries aggregate, written next to
 * the collection's file in place of the cards and actions it held. Writes
 * nothing when Metabase couldn't serialize an item, and throws listing why.
 * One request to the Metabase instance and API key in `.env.local`.
 */
export async function writeResources(appDirectory: string) {
  const appRoot = path.resolve(appDirectory);
  const queries = await discoverQueries(appRoot);
  const actions = await discoverActions(appRoot);
  const collection = readManifest(appRoot)?.manifest.collection;

  if (collection === undefined) {
    throw new Error(
      `No data_app.yaml in ${appRoot} names the app's collection. Write the collection under ${COLLECTIONS_DIR}/ and name its entity ID as \`collection\` first: the files are written into it.`,
    );
  }

  const { directory, existing } = collectionDirectory(appRoot, collection);
  const missing = missingEntityIds(appRoot, queries, actions);

  if (missing.length > 0) {
    throw new Error(missing.join("\n"));
  }

  const serialized = await requestSerialization(appRoot, {
    queries: queries.map(({ exportName, query, savedQuestionEntityId }) => {
      const { [QUERY_DEFINITIONS.idKey]: _entityId, ...definition } = query;
      return {
        name: exportNameToCardName(exportName),
        query: { stages: [definition] },
        entity_id: savedQuestionEntityId,
        collection_id: collection,
      };
    }),
    actions: actions.map(({ sourceActionId, copiedActionEntityId }) => ({
      action_id: sourceActionId,
      entity_id: copiedActionEntityId,
      collection_id: collection,
    })),
  });

  if (
    serialized.queries.length !== queries.length ||
    serialized.actions.length !== actions.length
  ) {
    throw new Error(
      "The serialization response doesn't answer every definition.",
    );
  }

  const labelled = [
    ...serialized.queries.map((result, index) => ({
      label: getRelativeDefinitionLocation(appRoot, queries[index]),
      result,
    })),
    ...serialized.actions.map((result, index) => ({
      label: getRelativeDefinitionLocation(appRoot, actions[index]),
      result,
    })),
    ...serialized.metrics.map((result) => ({ label: "A metric", result })),
  ];

  const errors = labelled.flatMap(({ label, result }) =>
    "error" in result ? [`${label}: ${result.error}`] : [],
  );

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  existing.forEach((filePath) => fs.rmSync(filePath));
  fs.mkdirSync(directory, { recursive: true });

  return labelled
    .flatMap(({ result }) =>
      "error" in result ? [] : [writeFile(directory, result)],
    )
    .map((target) => `Wrote ${path.relative(repoRootOf(appRoot), target)}`)
    .join("\n");
}
