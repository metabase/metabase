import React, { useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import { getUserIsAdmin } from "metabase/selectors/user";

import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Collections from "metabase/entities/collections";
import { canManageCollectionAuthorityLevel } from "metabase/collections/utils";

import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";

type CollectionsMap = Partial<Record<Collection["id"], Collection>>;

interface OwnProps {
  collectionParentId: Collection["id"];
}

interface StateProps {
  isAdmin: boolean;
  collectionsMap: CollectionsMap;
}

type FormAuthorityLevelFieldContainerProps = OwnProps & StateProps;

function mapStateToProps(state: State): StateProps {
  const { collections } = state.entities;
  return {
    isAdmin: getUserIsAdmin(state),
    collectionsMap: collections || ({} as CollectionsMap),
  };
}

function FormAuthorityLevelFieldContainer({
  collectionParentId,
  collectionsMap,
  isAdmin,
}: FormAuthorityLevelFieldContainerProps) {
  const canManageAuthorityLevel = useMemo(
    () =>
      isAdmin &&
      canManageCollectionAuthorityLevel(
        { parent_id: collectionParentId },
        collectionsMap,
      ),
    [collectionParentId, collectionsMap, isAdmin],
  );

  if (!canManageAuthorityLevel) {
    return null;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.FormCollectionAuthorityLevelPicker name="authority_level" />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  // Ensures there's data for the `collectionsMap` prop
  Collections.loadList({ loadingAndErrorWrapper: false }),
  connect(mapStateToProps),
)(FormAuthorityLevelFieldContainer);
