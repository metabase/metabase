import { createSelector } from "reselect";
import { t } from "ttag";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { color } from "metabase/lib/colors";
import { getUser } from "metabase/selectors/user";

import {
  isPersonalCollection,
  isPersonalCollectionChild,
} from "metabase/collections/utils";

function createForm({ extraFields = [] } = {}) {
  return {
    fields: (
      values = {
        color: color("brand"),
      },
    ) => [
      {
        name: "name",
        title: t`Name`,
        placeholder: t`My new fantastic collection`,
        autoFocus: true,
        validate: name =>
          (!name && t`Name is required`) ||
          (name && name.length > 100 && t`Name must be 100 characters or less`),
      },
      {
        name: "description",
        title: t`Description`,
        type: "text",
        placeholder: t`It's optional but oh, so helpful`,
        normalize: description => description || null, // expected to be nil or non-empty string
      },
      {
        name: "color",
        title: t`Color`,
        type: "hidden",
        initial: () => color("brand"),
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: t`Collection it's saved in`,
        type: "collection",
      },
      ...extraFields,
    ],
  };
}

function isPersonalOrPersonalChild(collection, collectionList) {
  if (!collection) {
    return false;
  }
  return (
    isPersonalCollection(collection) ||
    isPersonalCollectionChild(collection, collectionList)
  );
}

export const getFormSelector = createSelector(
  [
    (state, props) => props.collection || {},
    (state, props) => props.formValues || {},
    state => state.entities.collections || {},
    getUser,
  ],
  (collection, formValues, allCollections, user) => {
    const collectionList = Object.values(allCollections);
    const extraFields = [];

    const creatingNewCollection = !collection.id;
    const parentId = creatingNewCollection
      ? formValues.parent_id
      : collection.parent_id;

    const parentCollection = allCollections[parentId];
    const canManageAuthorityLevel =
      user.is_superuser &&
      !isPersonalCollection(collection) &&
      !isPersonalOrPersonalChild(parentCollection, collectionList);

    if (canManageAuthorityLevel) {
      extraFields.push(...PLUGIN_COLLECTIONS.authorityLevelFormFields);
    }

    const form = createForm({ extraFields });
    return form;
  },
);
