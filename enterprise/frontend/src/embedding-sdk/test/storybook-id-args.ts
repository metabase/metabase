const QUESTION_ENTITY_ID = "_GiVL6zYmsnBb1oqLCp4u";
const DASHBOARD_ENTITY_ID = "xBLdW9FsgRuB2HGhWiBa_";

export const questionIds = generateIds(QUESTION_ENTITY_ID);
export const questionIdArgType = {
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
};

const ZERO_CODE = 48;
function generateIds(entityId: string) {
  return {
    entityId,
    oneToManyEntityId: entityId + "1",
    wrongEntityId:
      entityId.slice(0, -1) +
      String.fromCharCode((entityId.at(-1)?.charCodeAt(0) || ZERO_CODE) + 1),
    numberId: 1,
    wrongNumberId: 99999999,
  };
}
