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

const propTypes = {
  databaseId: PropTypes.string,
  schema: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
  selectedId: PropTypes.string,
  schemaName: PropTypes.string,
};

export default function SavedQuestionList({
  onSelect,
  databaseId,
  selectedId,
  schemaName,
}) {
  return (
    <SavedQuestionListRoot>
      <Schemas.Loader
        id={generateSchemaId(SAVED_QUESTIONS_VIRTUAL_DB_ID, schemaName)}
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

              {tables.length === 0 ? (
                <Box my="120px">
                  <EmptyState message={t`Nothing here`} icon="all" />
                </Box>
              ) : null}
            </React.Fragment>
          );
        }}
      </Schemas.Loader>
    </SavedQuestionListRoot>
  );
}

SavedQuestionList.propTypes = propTypes;
