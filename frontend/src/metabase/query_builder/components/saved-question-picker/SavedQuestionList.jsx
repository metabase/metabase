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
};

function SavedQuestionList({ schema, onSelect, databaseId, selectedId }) {
  const tables =
    databaseId != null
      ? schema.tables.filter(table => table.db_id === databaseId)
      : schema.tables;

  return (
    <SavedQuestionListRoot>
      {tables.map(t => (
        <SelectList.Item
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
    </SavedQuestionListRoot>
  );
}

SavedQuestionList.propTypes = propTypes;

export default Schemas.load({
  id: (_state, props) =>
    generateSchemaId(SAVED_QUESTIONS_VIRTUAL_DB_ID, props.schemaName),
})(SavedQuestionList);
