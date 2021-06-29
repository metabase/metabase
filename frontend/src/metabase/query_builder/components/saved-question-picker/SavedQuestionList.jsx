import React from "react";
import PropTypes from "prop-types";

import Schemas from "metabase/entities/schemas";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/constants";
import { SelectList } from "metabase/components/select-list";
import { SavedQuestionListRoot } from "./SavedQuestionList.styled";

import { generateSchemaId } from "metabase/schema";

const propTypes = {
  databaseId: PropTypes.string,
  schema: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
};

function SavedQuestionList({ schema, onSelect, databaseId }) {
  const tables =
    databaseId != null
      ? schema.tables.filter(table => table.db_id === databaseId)
      : schema.tables;

  if (tables.length === 0) {
    return null;
  }

  return (
    <SavedQuestionListRoot>
      {tables.map(t => (
        <SelectList.Item
          key={t.id}
          variant="small"
          name={t.display_name}
          icon="table2"
          onSelect={() => {
            onSelect(t);
          }}
        />
      ))}
    </SavedQuestionListRoot>
  );
}

SavedQuestionList.propTypes = propTypes;

export default Schemas.load({
  id: (_state, props) =>
    generateSchemaId(SAVED_QUESTIONS_VIRTUAL_DB_ID, props.schemaName),
})(SavedQuestionList);
