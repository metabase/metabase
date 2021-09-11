import { t } from "ttag";

const CHANGE_TYPE = {
  ADD: "new",
  UPDATE: "update",
  REMOVE: "remove",
};

function getChangeType(before, after) {
  if (before == null && after != null) {
    return CHANGE_TYPE.ADD;
  }
  if (before != null && after == null) {
    return CHANGE_TYPE.REMOVE;
  }
  return CHANGE_TYPE.UPDATE;
}

function getFieldValue(obj) {
  return Object.entries(obj)[0];
}

const MESSAGES = {
  // Common
  name: {
    [CHANGE_TYPE.UPDATE]: newName => t`renamed this to` + " " + newName,
  },
  description: {
    [CHANGE_TYPE.ADD]: t`added a description`,
    [CHANGE_TYPE.UPDATE]: t`changed the description`,
  },
  archived: {
    [CHANGE_TYPE.UPDATE]: isArchived =>
      isArchived ? t`archived this` : t`unarchived this`,
  },

  // Questions
  dataset_query: {
    [CHANGE_TYPE.UPDATE]: t`edited the question`,
  },
  visualization_settings: {
    [CHANGE_TYPE.NEW]: t`changed the visualization settings`,
    [CHANGE_TYPE.UPDATE]: t`changed the visualization settings`,
  },
};

export function getRevisionMessage(revision) {
  const { diff, is_creation, is_reversion } = revision;
  if (is_creation) {
    return t`created this`;
  }
  if (is_reversion) {
    return t`reverted to an earlier revision`;
  }
  const { before, after } = diff;
  const [fieldName, valueBefore] = getFieldValue(before);
  const [, valueAfter] = getFieldValue(after);
  const changeType = getChangeType(valueBefore, valueAfter);

  const messageGetter = MESSAGES[fieldName][changeType];
  const message =
    typeof messageGetter === "function"
      ? messageGetter(valueAfter)
      : messageGetter;

  return message;
}
