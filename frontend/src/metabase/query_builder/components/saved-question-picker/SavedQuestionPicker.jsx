import React, { useMemo, useState, useCallback } from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import Collection from "metabase/entities/collections";
import Icon from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";
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
  databaseId: PropTypes.string,
  tableId: PropTypes.string,
};

const OUR_ANALYTICS_COLLECTION = {
  id: "root",
  schemaName: "Everything else",
  name: t`Our analytics`,
  icon: "folder",
};

function SavedQuestionPicker({
  onBack,
  onSelect,
  collections,
  schemas,
  databaseId,
  tableId,
}) {
  const [selectedCollection, setSelectedCollection] = useState(
    OUR_ANALYTICS_COLLECTION,
  );

  const handleSelect = useCallback(id => {
    setSelectedCollection(id);
  }, []);

  const collectionTree = useMemo(() => {
    return schemas.length > 0
      ? [
          OUR_ANALYTICS_COLLECTION,
          ...buildCollectionTree(
            collections,
            new Set(schemas.map(schema => schema.name)),
          ),
        ]
      : [OUR_ANALYTICS_COLLECTION];
  }, [collections, schemas]);

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
        selectedId={tableId}
        databaseId={databaseId}
        schemaName={selectedCollection.schemaName}
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
