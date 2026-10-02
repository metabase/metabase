import path from "node:path";

import {
  discoverActions,
  discoverQueries,
  getRelativeDefinitionLocation,
} from "./discover";
import {
  MODEL_DIRS,
  RESOURCES_DIR,
  type ResourceFile,
  readResources,
} from "./resources";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

const CARDS_DIR = `${RESOURCES_DIR}/${MODEL_DIRS.Card}/`;
const ACTIONS_DIR = `${RESOURCES_DIR}/${MODEL_DIRS.Action}/`;

const resourcePath = (file: ResourceFile) => `${RESOURCES_DIR}/${file.path}`;

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
        `${location} names saved question ${entityId}, which no file in ${CARDS_DIR} holds.`,
      ];
    }

    return isQuestion(file)
      ? []
      : [`${location} names ${resourcePath(file)}, which is not a question.`];
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
          `${location} names action ${entityId}, which no file in ${ACTIONS_DIR} holds.`,
        ];
  });

  return [...queryProblems, ...actionProblems];
}

/**
 * A question or action no definition names is still loaded by a pull: the
 * question into the app's collection, the action onto its model copy, where it
 * is one more write the app's viewers can run.
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
      (file) =>
        `${resourcePath(file)} is ${isQuestion(file) ? "a question" : "an action"} no definition names. Delete it.`,
    );
}

/**
 * Fails when the app's definitions and its `resources/` disagree in a way a
 * repository pull can't see: the pull validates the resources on their own,
 * never against the app's code. Reads nothing from Metabase.
 */
export async function checkResources(appDirectory: string) {
  const appRoot = path.resolve(appDirectory);
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const files = readResources(appRoot);

  const problems = [
    ...definitionProblems(appRoot, queries, actions, files),
    ...leftoverProblems(queries, actions, files),
  ];

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}
