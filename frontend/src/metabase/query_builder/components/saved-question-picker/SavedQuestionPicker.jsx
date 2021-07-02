import React, { useMemo, useState, useCallback } from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";
import Collection, {
  ROOT_COLLECTION,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import {
  isPersonalCollection,
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
} from "metabase/collections/utils";
import Schemas from "metabase/entities/schemas";

import SavedQuestionList from "./SavedQuestionList";
import {
  SavedQuestionPickerRoot,
  CollectionsContainer,
  BackButton,
} from "./SavedQuestionPicker.styled";
import { buildCollectionTree } from "./utils";

const propTypes = {
  onSelect: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  collections: PropTypes.array.isRequired,
  schemas: PropTypes.array.isRequired,
  currentUser: PropTypes.object.isRequired,
  databaseId: PropTypes.string,
  tableId: PropTypes.string,
};

const OUR_ANALYTICS_COLLECTION = {
  ...ROOT_COLLECTION,
  schemaName: "Everything else",
  icon: "folder",
};

const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
};

function SavedQuestionPicker({
  onBack,
  onSelect,
  collections,
  schemas,
  currentUser,
  databaseId,
  tableId,
}) {
  const [selectedCollection, setSelectedCollection] = useState(
    OUR_ANALYTICS_COLLECTION,
  );

  const handleSelect = useCallback(collection => {
    setSelectedCollection(collection);
  }, []);

  const collectionTree = useMemo(() => {
    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const nonPersonalOrArchivedCollections = collections.filter(
      nonPersonalOrArchivedCollection,
    );

    preparedCollections.push(...nonPersonalOrArchivedCollections);
    preparedCollections.push(...userPersonalCollections);

    if (currentUser.is_superuser) {
      const otherPersonalCollections = collections.filter(
        collection =>
          isPersonalCollection(collection) &&
          collection.personal_owner_id !== currentUser.id,
      );

      if (otherPersonalCollections.length > 0) {
        preparedCollections.push({
          ...ALL_PERSONAL_COLLECTIONS_ROOT,
          children: otherPersonalCollections,
        });
      }
    }

    return [
      OUR_ANALYTICS_COLLECTION,
      ...buildCollectionTree(
        [OUR_ANALYTICS_COLLECTION, ...preparedCollections],
        new Set(schemas.map(schema => schema.name)),
      ),
    ];
  }, [collections, schemas, currentUser]);

  return (
    <SavedQuestionPickerRoot>
      <CollectionsContainer>
        <BackButton onClick={onBack}>
          <Icon name="chevronleft" className="mr1" />
          {t`Saved questions`}
        </BackButton>
        <Box my={1}>
          <Tree
            data={collectionTree}
            onSelect={handleSelect}
            selectedId={selectedCollection.id}
          />
        </Box>
      </CollectionsContainer>
      <SavedQuestionList
        collection={selectedCollection}
        selectedId={tableId}
        databaseId={databaseId}
        onSelect={onSelect}
      />
    </SavedQuestionPickerRoot>
  );
}

SavedQuestionPicker.propTypes = propTypes;

const mapStateToProps = ({ currentUser }) => ({ currentUser });

export default _.compose(
  Schemas.loadList({
    query: { dbId: SAVED_QUESTIONS_VIRTUAL_DB_ID },
  }),
  Collection.loadList({
    query: () => ({ tree: true }),
  }),
  connect(mapStateToProps),
)(SavedQuestionPicker);
