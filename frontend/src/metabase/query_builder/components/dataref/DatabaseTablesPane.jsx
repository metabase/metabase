import React from "react";
import { jt } from "ttag";
import _ from "underscore";
import PropTypes from "prop-types";

import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";
import {
  FieldListItem,
  FieldListItemName,
  FieldListItemIcon,
  FieldListTitle,
  FieldListContainer,
  FieldListIcon,
  FieldListTitleText,
} from "./FieldList/FieldList.styled";

const DatabaseTablesPane = ({ database, show, questions }) => {
  const tables = database.tables.sort((a, b) => a.name.localeCompare(b.name));
  const models = questions.sort((a, b) => a.name.localeCompare(b.name));
  return (
    <FieldListContainer>
      <FieldListTitle>
        <FieldListIcon name="model" />
        <FieldListTitleText>{jt`${models.length} models`}</FieldListTitleText>
      </FieldListTitle>
      <ul>
        {models.map(model => (
          <FieldListItem key={model.id}>
            <a onClick={() => show("model", model)}>
              <FieldListItemIcon name="model" />
              <FieldListItemName>{model.name}</FieldListItemName>
            </a>
          </FieldListItem>
        ))}
      </ul>
      <br></br>
      <FieldListTitle>
        <FieldListIcon name="table" />
        <FieldListTitleText>{jt`${tables.length} tables`}</FieldListTitleText>
      </FieldListTitle>
      <ul>
        {tables.map(table => (
          <li key={table.id}>
            <FieldListItem key={table.id}>
              <a onClick={() => show("table", table)}>
                <FieldListItemIcon name="table" />
                <FieldListItemName>{table.name}</FieldListItemName>
              </a>
            </FieldListItem>
          </li>
        ))}
      </ul>
    </FieldListContainer>
  );
};

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
  questions: PropTypes.arrayOf(PropTypes.object),
};

export default _.compose(
  Tables.loadList({
    query: (_state, props) => ({
      dbId: props.database?.id,
    }),
  }),
  Questions.loadList({
    query: (_state, props) => ({
      f: "database",
      model_id: props.database?.id,
    }),
  }),
)(DatabaseTablesPane);
