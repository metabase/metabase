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
  // So we need to filter out null values to get a correct revision description
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

function getSeriesChangeDescription(prevCards, cards) {
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

const CHANGE_DESCRIPTIONS = {
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
    [CHANGE_TYPE.ADD]: t`edited the question`,
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
        return getSeriesChangeDescription(prevCards, cards);
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

export function hasDiff(revision) {
  return Boolean(
    revision.diff && (revision.diff.before || revision.diff.after),
  );
}

export function getChangedFields(revision) {
  if (!hasDiff(revision)) {
    return [];
  }
  const registeredFields = Object.keys(CHANGE_DESCRIPTIONS);

  // There are cases when either 'before' or 'after' states are null
  // So we need to pick another one
  const fields = Object.keys(revision.diff.before || revision.diff.after);

  return fields.filter(field => registeredFields.includes(field));
}

function formatChangeDescriptions(descriptions) {
  if (!descriptions.length) {
    return null;
  }
  if (descriptions.length === 1) {
    return descriptions[0];
  }
  const last = _.last(descriptions);
  const exceptLast = descriptions.slice(0, descriptions.length - 1);

  // Makes sure the last description is separated with "and" word rather than a comma
  return exceptLast.join(", ") + " " + t`and` + " " + last;
}

export function getRevisionDescription(revision) {
  const { diff, is_creation, is_reversion } = revision;
  if (is_creation) {
    return t`created this`;
  }
  if (is_reversion) {
    return t`reverted to an earlier revision`;
  }

  const { before, after } = diff;
  const changes = getChangedFields(revision)
    .map(fieldName => {
      const valueBefore = before?.[fieldName];
      const valueAfter = after?.[fieldName];
      const changeType = getChangeType(fieldName, valueBefore, valueAfter);
      const description = CHANGE_DESCRIPTIONS[fieldName]?.[changeType];
      return typeof description === "function"
        ? description(valueBefore, valueAfter)
        : description;
    })
    .filter(Boolean);

  return formatChangeDescriptions(changes);
}

export function isValidRevision(revision) {
  if (revision.is_creation || revision.is_reversion) {
    return true;
  }
  return getChangedFields(revision).length > 0;
}
