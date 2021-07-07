import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import { Box } from "grid-styled";

import Schemas from "metabase/entities/schemas";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";
import { SelectList } from "metabase/components/select-list";
import EmptyState from "metabase/components/EmptyState";
import { generateSchemaId } from "metabase/schema";

import { SavedQuestionListRoot } from "./SavedQuestionList.styled";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

const propTypes = {
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

export default function SavedQuestionList({
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
          )}
        >
          {({ schema }) => {
            const tables =
              databaseId != null
                ? schema.tables.filter(table => table.db_id === databaseId)
                : schema.tables;
            return (
              <React.Fragment>
                {tables.map(t => (
                  <SelectList.Item
                    id={t.id}
                    isSelected={selectedId === t.id}
                    key={t.id}
                    size="small"
                    name={t.display_name}
                    icon="table2"
                    onSelect={() => onSelect(t)}
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
