import path from "node:path";

import { readManifest } from "../data-app-dev/config/read-manifest";

import {
  discoverActions,
  discoverQueries,
  getRelativeDefinitionLocation,
} from "./discover";
import {
  type AppResources,
  COLLECTIONS_DIR,
  type ResourceFile,
  readResources,
} from "./resources";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

const isQuestion = (file: ResourceFile) =>
  file.model === "Card" && file.entity.type === "question";

function definitionProblems(
  appRoot: string,
  queries: DiscoveredQuery[],
  actions: DiscoveredAction[],
  files: ResourceFile[],
) {
  const fileOf = (model: ResourceFile["model"], entityId: string) =>
    files.find(
      (file) => file.model === model && file.entity.entity_id === entityId,
    );

  const queryProblems = queries.flatMap((query) => {
    const location = getRelativeDefinitionLocation(appRoot, query);
    const entityId = query.savedQuestionEntityId;

    if (!entityId) {
      return [`${location} has no savedQuestionEntityId.`];
    }

    const file = fileOf("Card", entityId);

    if (!file) {
      return [
        `${location} names saved question ${entityId}, which no file in ${COLLECTIONS_DIR}/ holds in the app's collection.`,
      ];
    }

    return isQuestion(file)
      ? []
      : [`${location} names ${file.path}, which is not a question.`];
  });

  const actionProblems = actions.flatMap((action) => {
    const location = getRelativeDefinitionLocation(appRoot, action);
    const entityId = action.copiedActionEntityId;

    if (!entityId) {
      return [`${location} has no copiedActionEntityId.`];
    }

    return fileOf("Action", entityId)
      ? []
      : [
          `${location} names action ${entityId}, which no file in ${COLLECTIONS_DIR}/ holds in the app's collection.`,
        ];
  });

  return [...queryProblems, ...actionProblems];
}

/**
 * A question or action no definition names is still loaded by a pull: the
 * question and the action into the app's collection, where the action is one
 * more write the app's viewers can run.
 */
function leftoverProblems(
  queries: DiscoveredQuery[],
  actions: DiscoveredAction[],
  files: ResourceFile[],
) {
  const namedEntityIds: Record<ResourceFile["model"], Set<unknown>> = {
    Card: new Set(queries.map((query) => query.savedQuestionEntityId)),
    Action: new Set(actions.map((action) => action.copiedActionEntityId)),
  };
  const isNamed = ({ model, entity }: ResourceFile) =>
    typeof entity.entity_id === "string" &&
    namedEntityIds[model].has(entity.entity_id);

  return files
    .filter(
      (file) => (isQuestion(file) || file.model === "Action") && !isNamed(file),
    )
    .map(
      (file) => `${file.path} is a resource that is not referenced anywhere.`,
    );
}

/**
 * The app's collection files, located through the collection its manifest
 * names, or the problem that keeps them from being located: a pull refuses a
 * manifest that names no collection, or one whose collection the repository
 * doesn't hold, before it loads anything.
 */
function locateResources(
  appRoot: string,
): { resources: AppResources } | { problems: string[] } {
  const manifest = readManifest(appRoot);

  if (!manifest) {
    throw new Error(`No data_app.yaml found in ${appRoot}.`);
  }

  const collection = manifest.manifest.collection;

  if (collection === undefined) {
    return {
      problems: [
        `data_app.yaml names no collection. Write the app's collection under ${COLLECTIONS_DIR}/ and name its entity ID as \`collection\`.`,
      ],
    };
  }

  const resources = readResources(appRoot, collection);

  return resources.collectionPath === undefined
    ? {
        problems: [
          `data_app.yaml names collection ${collection}, which no file in ${COLLECTIONS_DIR}/ holds.`,
        ],
      }
    : { resources };
}

/**
 * Fails when the app's definitions and the files of its collection disagree in
 * a way a repository pull can't see: the pull validates the files on their own,
 * never against the app's code. Reads nothing from Metabase.
 */
export async function checkResources(appDirectory: string) {
  const appRoot = path.resolve(appDirectory);
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const located = locateResources(appRoot);

  const problems =
    "problems" in located
      ? located.problems
      : [
          ...definitionProblems(
            appRoot,
            queries,
            actions,
            located.resources.files,
          ),
          ...leftoverProblems(queries, actions, located.resources.files),
        ];

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}
