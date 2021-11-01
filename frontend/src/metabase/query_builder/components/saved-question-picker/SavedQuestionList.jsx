import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import _ from "underscore";
import { Box } from "grid-styled";

import { PLUGIN_MODERATION } from "metabase/plugins";
import Schemas from "metabase/entities/schemas";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import EmptyState from "metabase/components/EmptyState";
import { generateSchemaId } from "metabase/schema";

import {
  SavedQuestionListRoot,
  SavedQuestionListItem,
} from "./SavedQuestionList.styled";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

const propTypes = {
  isDatasets: PropTypes.bool,
  databaseId: PropTypes.string,
  schema: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedId: PropTypes.string,
  collection: PropTypes.shape({
    id: PropTypes.oneOfType([
      PropTypes.string.isRequired,
      PropTypes.number.isRequired,
    ]),
    schemaName: PropTypes.string.isRequired,
  }).isRequired,
};

function SavedQuestionList({
  isDatasets,
  onSelect,
  databaseId,
  selectedId,
  collection,
}) {
  const emptyState = (
    <Box my="120px">
      <EmptyState message={t`Nothing here`} icon="all" />
    </Box>
  );

  const isVirtualCollection = collection.id === PERSONAL_COLLECTIONS.id;

  return (
    <SavedQuestionListRoot>
      {!isVirtualCollection && (
        <Schemas.Loader
          id={generateSchemaId(
            SAVED_QUESTIONS_VIRTUAL_DB_ID,
            collection.schemaName,
            { isDatasets },
          )}
        >
          {({ schema }) => {
            const tables =
              databaseId != null
                ? schema.tables.filter(table => table.db_id === databaseId)
                : schema.tables;
            return (
              <React.Fragment>
                {_.sortBy(tables, "display_name").map(t => (
                  <SavedQuestionListItem
                    id={t.id}
                    isSelected={selectedId === t.id}
                    key={t.id}
                    size="small"
                    name={t.display_name}
                    icon={{
                      name: isDatasets ? "dataset" : "table2",
                      size: 16,
                    }}
                    onSelect={() => onSelect(t)}
                    rightIcon={PLUGIN_MODERATION.getStatusIcon(
                      t.moderated_status,
                    )}
                  />
                ))}

                {tables.length === 0 ? emptyState : null}
              </React.Fragment>
            );
          }}
        </Schemas.Loader>
      )}
      {isVirtualCollection && emptyState}
    </SavedQuestionListRoot>
  );
}

SavedQuestionList.propTypes = propTypes;

export default SavedQuestionList;
