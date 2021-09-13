import { t, ngettext, msgid } from "ttag";
import _ from "underscore";

const CHANGE_TYPE = {
  ADD: "new",
  UPDATE: "update",
  REMOVE: "remove",
};

function getCardsArraySafe(cards) {
  // Cards diff will contain null values for cards that were not changed
  // Also for e.g. new card revision, the 'before' state can be just null
  // like { before: null, after: [ null, null, { ...cardInfo } ] }
  // So we need to filter out null values to get a correct revision message
  return Array.isArray(cards) ? cards.filter(Boolean) : [];
}

function hasSeries(card) {
  // card can be null or an object
  return typeof card.series !== "undefined";
}

function hasSeriesChange(cards) {
  return cards.some(hasSeries);
}

function getDashboardCardsChangeType(_prevCards, _cards) {
  const prevCards = getCardsArraySafe(_prevCards);
  const cards = getCardsArraySafe(_cards);
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

function getSeriesChangeMessage(prevCards, cards) {
  const changedCardIndex = prevCards.findIndex(hasSeries);
  const seriesBefore = prevCards[changedCardIndex].series || [];
  const seriesAfter = cards[changedCardIndex].series || [];
  if (seriesBefore.length === seriesAfter.length) {
    return t`modified question's series`;
  }
  return seriesAfter.length > seriesBefore.length
    ? t`added series to a question`
    : t`removed series from a question`;
}

const MESSAGES = {
  // Common
  name: {
    [CHANGE_TYPE.UPDATE]: (oldName, newName) =>
      t`renamed this to` + " " + `"${newName}"`,
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
    [CHANGE_TYPE.ADD]: t`changed the visualization settings`,
    [CHANGE_TYPE.UPDATE]: t`changed the visualization settings`,
    [CHANGE_TYPE.REMOVE]: t`changed the visualization settings`,
  },

  // Dashboards
  cards: {
    [CHANGE_TYPE.ADD]: (_prevCards, _cards) => {
      const prevCards = getCardsArraySafe(_prevCards);
      const cards = getCardsArraySafe(_cards);
      const count = cards.length - prevCards.length;
      return ngettext(msgid`added a card`, `added ${count} cards`, count);
    },
    [CHANGE_TYPE.UPDATE]: (_prevCards, _cards) => {
      const prevCards = getCardsArraySafe(_prevCards);
      const cards = getCardsArraySafe(_cards);
      if (hasSeriesChange(prevCards) || hasSeriesChange(cards)) {
        return getSeriesChangeMessage(prevCards, cards);
      }
      return t`moved cards around`;
    },
    [CHANGE_TYPE.REMOVE]: (_prevCards, _cards) => {
      const prevCards = getCardsArraySafe(_prevCards);
      const cards = getCardsArraySafe(_cards);
      const count = prevCards.length - cards.length;
      return ngettext(msgid`removed a card`, `removed ${count} cards`, count);
    },
  },
};

function formatChangeMessages(messages) {
  if (!messages.length) {
    return null;
  }
  if (messages.length === 1) {
    return {
      title: messages[0],
    };
  }
  const lastMessage = _.last(messages);
  const messagesExceptLast = messages.slice(0, messages.length - 1);
  const combinedMessage =
    messagesExceptLast.join(", ") + " " + t`and` + " " + lastMessage;
  return {
    title: t`edited this`,
    description: combinedMessage,
  };
}

export function getRevisionMessage(revision) {
  const { diff, is_creation, is_reversion } = revision;
  if (is_creation) {
    return {
      title: t`created this`,
    };
  }
  if (is_reversion) {
    return {
      title: t`reverted to an earlier revision`,
    };
  }

  const { before, after } = diff;
  const changedFields = Object.keys(before);

  const changes = changedFields
    .map(fieldName => {
      const valueBefore = before[fieldName];
      const valueAfter = after[fieldName];
      const changeType = getChangeType(fieldName, valueBefore, valueAfter);

      const messageGetter = MESSAGES[fieldName]?.[changeType];
      if (!messageGetter) {
        return;
      }

      return typeof messageGetter === "function"
        ? messageGetter(valueBefore, valueAfter)
        : messageGetter;
    })
    .filter(Boolean);

  return formatChangeMessages(changes);
}

export function isValidRevision(revision) {
  if (revision.is_creation || revision.is_reversion) {
    return true;
  }
  return !!(revision.diff && revision.diff.before && revision.diff.after);
}
