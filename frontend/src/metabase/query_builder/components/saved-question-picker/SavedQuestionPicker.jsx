import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import Collection from "metabase/entities/collections";
import Icon from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";

import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";
import { MetabaseApi } from "metabase/services";

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
  databaseId: PropTypes.string,
};

const OUR_ANALYTICS_COLLECTION = {
  id: "root",
  schemaName: "Everything else",
  name: t`Our analytics`,
  icon: "folder",
};

function SavedQuestionPicker({ onBack, onSelect, collections, databaseId }) {
  const [allowedSchemas, setAllowedSchemas] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(
    OUR_ANALYTICS_COLLECTION,
  );

  useEffect(() => {
    let isCancelled = false;

    async function fetchCollectionSchemas() {
      const collectionSchemas = await MetabaseApi.db_schemas({
        dbId: SAVED_QUESTIONS_VIRTUAL_DB_ID,
      });

      if (!isCancelled) {
        setAllowedSchemas(collectionSchemas);
      }
    }

    fetchCollectionSchemas();
    return () => (isCancelled = true);
  }, []);

  const handleSelect = useCallback(id => {
    setSelectedCollection(id);
  }, []);

  const collectionTree = useMemo(() => {
    return allowedSchemas
      ? [
          OUR_ANALYTICS_COLLECTION,
          ...buildCollectionTree(collections, new Set(allowedSchemas)),
        ]
      : [OUR_ANALYTICS_COLLECTION];
  }, [collections, allowedSchemas]);

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
  Collection.loadList({
    query: () => ({ tree: true }),
  }),
  connect(mapStateToProps),
)(SavedQuestionPicker);
