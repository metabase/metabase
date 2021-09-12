import { t, ngettext, msgid } from "ttag";

const CHANGE_TYPE = {
  ADD: "new",
  UPDATE: "update",
  REMOVE: "remove",
};

function isEmptyArray(array) {
  return !Array.isArray(array) || array.length === 0;
}

function getArrayLengthSafe(array) {
  return array?.length || 0;
}

function getDashboardCardsChangeType(prevCards, cards) {
  if (isEmptyArray(prevCards) && !isEmptyArray(cards)) {
    return CHANGE_TYPE.ADD;
  }
  if (isEmptyArray(cards) && !isEmptyArray(prevCards)) {
    return CHANGE_TYPE.REMOVE;
  }
  if (prevCards.length === cards.length) {
    return CHANGE_TYPE.UPDATE;
  }
  return cards.length > prevCards.length ? CHANGE_TYPE.ADD : CHANGE_TYPE.REMOVE;
}

function getChangeType(field, before, after) {
  if (field === "cards") {
    return getDashboardCardsChangeType(before, after);
  }
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
    [CHANGE_TYPE.UPDATE]: (oldName, newName) =>
      t`renamed this to` + " " + newName,
  },
  description: {
    [CHANGE_TYPE.ADD]: t`added a description`,
    [CHANGE_TYPE.UPDATE]: t`changed the description`,
  },
  archived: {
    [CHANGE_TYPE.UPDATE]: (wasArchived, isArchived) =>
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

  // Dashboards
  cards: {
    [CHANGE_TYPE.ADD]: (prevCards, cards) => {
      const count = getArrayLengthSafe(cards) - getArrayLengthSafe(prevCards);
      return ngettext(msgid`added a card`, `added ${count} cards`, count);
    },
    [CHANGE_TYPE.UPDATE]: t`moved cards around`,
    [CHANGE_TYPE.REMOVE]: (prevCards, cards) => {
      const count = getArrayLengthSafe(prevCards) - getArrayLengthSafe(cards);
      return ngettext(msgid`removed a card`, `removed ${count} cards`, count);
    },
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
  const changeType = getChangeType(fieldName, valueBefore, valueAfter);

  const messageGetter = MESSAGES[fieldName][changeType];
  const message =
    typeof messageGetter === "function"
      ? messageGetter(valueBefore, valueAfter)
      : messageGetter;

  return message;
}
