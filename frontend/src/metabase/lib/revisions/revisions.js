import React from "react";
import { t, jt, ngettext, msgid } from "ttag";
import {
  EntityLink,
  RevisionTitle,
  RevisionBatchedDescription,
} from "./components";

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

function getAddedRemovedCardIds(_prevCards, _cards) {
  const prevCardIds = getCardsArraySafe(_prevCards).map(c => c.id);
  const cardIds = getCardsArraySafe(_cards).map(c => c.id);

  const addedCardIds = cardIds.filter(id => !prevCardIds.includes(id));
  const removedCardIds = prevCardIds.filter(id => !cardIds.includes(id));

  return { addedCardIds, removedCardIds };
}

function getDashboardCardsChangeType(_prevCards, _cards) {
  const { addedCardIds, removedCardIds } = getAddedRemovedCardIds(
    _prevCards,
    _cards,
  );

  const types = [];
  if (addedCardIds.length > 0) {
    types.push(CHANGE_TYPE.ADD);
  }
  if (removedCardIds.length > 0) {
    types.push(CHANGE_TYPE.REMOVE);
  }
  if (addedCardIds.length === 0 && removedCardIds.length === 0) {
    types.push(CHANGE_TYPE.UPDATE);
  }
  return types;
}

function getChangeTypes(field, before, after) {
  if (field === "cards") {
    return getDashboardCardsChangeType(before, after);
  }
  if (before == null && after != null) {
    return [CHANGE_TYPE.ADD];
  }
  if (before != null && after == null) {
    return [CHANGE_TYPE.REMOVE];
  }
  return [CHANGE_TYPE.UPDATE];
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

export function getCollectionChangeDescription(prevCollectionId, collectionId) {
  const key = `collection-from-${prevCollectionId}-to-${collectionId}`;
  return [
    jt`moved this to ${(
      <EntityLink
        key={key}
        entityId={collectionId || "root"}
        entityType="collections"
        fallback={t`Unknown`}
      />
    )}`,
  ];
}

const CHANGE_DESCRIPTIONS = {
  // Common
  name: {
    [CHANGE_TYPE.UPDATE]: (oldName, newName) => t`renamed this to "${newName}"`,
  },
  description: {
    [CHANGE_TYPE.ADD]: t`added a description`,
    [CHANGE_TYPE.UPDATE]: t`changed the description`,
  },
  archived: {
    [CHANGE_TYPE.UPDATE]: (wasArchived, isArchived) =>
      isArchived ? t`archived this` : t`unarchived this`,
  },
  collection_id: {
    [CHANGE_TYPE.ADD]: getCollectionChangeDescription,
    [CHANGE_TYPE.UPDATE]: getCollectionChangeDescription,
    [CHANGE_TYPE.REMOVE]: getCollectionChangeDescription,
  },

  // Questions & Models
  dataset: {
    [CHANGE_TYPE.UPDATE]: (wasDataset, isDataset) =>
      isDataset
        ? t`turned this into a model`
        : t`changed this from a model to a saved question`,
  },
  dataset_query: {
    [CHANGE_TYPE.ADD]: t`edited the question`,
    [CHANGE_TYPE.UPDATE]: t`edited the question`,
  },
  display: {
    [CHANGE_TYPE.UPDATE]: (prevDisplay, display) =>
      t`changed the display from ${prevDisplay} to ${display}`,
  },
  visualization_settings: {
    [CHANGE_TYPE.ADD]: t`changed the visualization settings`,
    [CHANGE_TYPE.UPDATE]: t`changed the visualization settings`,
    [CHANGE_TYPE.REMOVE]: t`changed the visualization settings`,
  },
  result_metadata: {
    [CHANGE_TYPE.ADD]: t`edited the metadata`,
    [CHANGE_TYPE.UPDATE]: t`edited the metadata`,
    [CHANGE_TYPE.REMOVE]: t`edited the metadata`,
  },

  // Dashboards
  cards: {
    [CHANGE_TYPE.ADD]: (_prevCards, _cards) => {
      const { addedCardIds } = getAddedRemovedCardIds(_prevCards, _cards);
      const count = addedCardIds.length;
      return ngettext(msgid`added a card`, `added ${count} cards`, count);
    },
    [CHANGE_TYPE.UPDATE]: (_prevCards, _cards) => {
      const prevCards = getCardsArraySafe(_prevCards);
      const cards = getCardsArraySafe(_cards);
      if (hasSeriesChange(prevCards) || hasSeriesChange(cards)) {
        return getSeriesChangeDescription(prevCards, cards);
      }
      return t`rearranged the cards`;
    },
    [CHANGE_TYPE.REMOVE]: (_prevCards, _cards) => {
      const { removedCardIds } = getAddedRemovedCardIds(_prevCards, _cards);
      const count = removedCardIds.length;
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
  const fields = Object.keys(revision.diff.after || revision.diff.before);

  return fields.filter(field => registeredFields.includes(field));
}

export function getRevisionTitleText(username, message) {
  return `${username} ${message}`;
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
  let changes = [];
  getChangedFields(revision).forEach(fieldName => {
    const valueBefore = before?.[fieldName];
    const valueAfter = after?.[fieldName];
    const changeTypes = getChangeTypes(fieldName, valueBefore, valueAfter);
    changeTypes.forEach(changeType => {
      const description = CHANGE_DESCRIPTIONS[fieldName]?.[changeType];
      changes.push(
        typeof description === "function"
          ? description(valueBefore, valueAfter)
          : description,
      );
    });
  });
  changes = changes.filter(Boolean);

  return changes.length === 1 ? changes[0] : changes;
}

export function isValidRevision(revision) {
  if (revision.is_creation || revision.is_reversion) {
    return true;
  }
  return getChangedFields(revision).length > 0;
}

function getRevisionUsername(revision, currentUser) {
  const revisionUser = revision.user;
  return revisionUser.id === currentUser?.id
    ? t`You`
    : revisionUser.common_name;
}

function getRevisionEpochTimestamp(revision) {
  return new Date(revision.timestamp).valueOf();
}

export const REVISION_EVENT_ICON = "pencil";

export function getRevisionEventsForTimeline(
  revisions = [],
  { currentUser, canWrite = false },
  revertFn,
) {
  return revisions
    .filter(isValidRevision)
    .map((revision, index) => {
      const isRevertable = canWrite && index !== 0;
      const username = getRevisionUsername(revision, currentUser);
      const changes = getRevisionDescription(revision);

      const event = {
        timestamp: getRevisionEpochTimestamp(revision),
        icon: REVISION_EVENT_ICON,
        isRevertable,
        revision,
      };

      const isChangeEvent = !revision.is_creation && !revision.is_reversion;

      // For some events, like moving an item to another collection,
      // the `changes` object are an array, however they represent a single change
      // This happens when we need to have JSX inside a message (e.g. a link to a new collection)
      const isMultipleFieldsChange =
        Array.isArray(changes) && changes.length > 1;

      // If > 1 item's fields are changed in a single revision,
      // the changes are batched into a single string like:
      // "added a description, moved cards around and archived this"
      // Batched messages can be long, so if the revision's diff contains > 1 field,
      // we want to show the changelog in a description and set a title to just "User edited this"
      // If only one field is changed, we just show everything in the title
      // like "John added a description"
      let message;
      if (isChangeEvent && isMultipleFieldsChange) {
        message = t`edited this`;
        event.title = <RevisionTitle username={username} message={message} />;
        event.description = (
          <RevisionBatchedDescription
            changes={changes}
            fallback={revision.description}
          />
        );
      } else {
        message = changes;
        event.title = <RevisionTitle username={username} message={message} />;
      }
      event.titleText = getRevisionTitleText(username, message);

      return event;
    })
    .filter(Boolean);
}
