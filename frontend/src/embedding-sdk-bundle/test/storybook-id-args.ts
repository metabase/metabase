import type { InputType } from "storybook/internal/types";

const QUESTION_ENTITY_ID = "VFCGVYPVtLzCtt4teeoW4";
const DASHBOARD_ENTITY_ID = "xBLdW9FsgRuB2HGhWiBa_";
const COLLECTION_ENTITY_ID = "HyB3nRtqb7pBPhFG26evI";

export const questionIds = generateIds(QUESTION_ENTITY_ID);
export const questionIdArgType: InputType = {
  options: [
    questionIds.entityId,
    questionIds.oneToManyEntityId,
    questionIds.wrongEntityId,
    questionIds.numberId,
    questionIds.wrongNumberId,
  ],
  control: {
    type: "select",
    labels: {
      [questionIds.entityId]: "Entity ID",
      [questionIds.oneToManyEntityId]: "One Too Many Entity ID",
      [questionIds.wrongEntityId]: "Wrong Entity ID",
      [questionIds.numberId]: "Number ID",
      [questionIds.wrongNumberId]: "Wrong Number ID",
    },
  },
};

export const dashboardIds = generateIds(DASHBOARD_ENTITY_ID);
export const dashboardIdArgType = {
  options: [
    dashboardIds.entityId,
    dashboardIds.oneToManyEntityId,
    dashboardIds.wrongEntityId,
    dashboardIds.numberId,
    dashboardIds.wrongNumberId,
  ],
  control: {
    type: "select",
    labels: {
      [dashboardIds.entityId]: "Entity ID",
      [dashboardIds.oneToManyEntityId]: "One Too Many Entity ID",
      [dashboardIds.wrongEntityId]: "Wrong Entity ID",
      [dashboardIds.numberId]: "Number ID",
      [dashboardIds.wrongNumberId]: "Wrong Number ID",
    },
  },
} as const;

export const collectionIds = generateIds(COLLECTION_ENTITY_ID);

export const collectionIdArgType = {
  options: [
    collectionIds.entityId,
    collectionIds.oneToManyEntityId,
    collectionIds.wrongEntityId,
    collectionIds.numberId,
    collectionIds.wrongNumberId,
  ],
  control: {
    type: "select",
    labels: {
      [collectionIds.entityId]: "Entity ID",
      [collectionIds.oneToManyEntityId]: "One Too Many Entity ID",
      [collectionIds.wrongEntityId]: "Wrong Entity ID",
      [collectionIds.numberId]: "Number ID",
      [collectionIds.wrongNumberId]: "Wrong Number ID",
    },
  },
};

const ZERO_CODE = 48;
function generateIds(entityId: string) {
  return {
    entityId,
    oneToManyEntityId: entityId + "1",
    wrongEntityId:
      entityId.slice(0, -1) +
      String.fromCharCode((entityId.at(-1)?.charCodeAt(0) || ZERO_CODE) + 1),
    numberId: 12,
    wrongNumberId: 99999999,
  };
}
