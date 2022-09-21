import React from "react";
import { jt } from "ttag";
import _ from "underscore";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import Tables from "metabase/entities/tables";
import Questions from "metabase/entities/questions";

const DatabaseTablesPane = ({ database, show, questions }) => {
  const tables = database.tables.sort((a, b) => a.name.localeCompare(b.name));
  const sortedQuestions = questions.sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <div>
      <div className="pl1 mt2 flex align-center justify-between">
        <div className="flex align-center">
          <Icon name="model" className="pr1" size={12} />
          <span className="flex-full flex p1 text-bold">{jt`${sortedQuestions.length} models`}</span>
        </div>
      </div>

      <ul>
        {sortedQuestions.map(question => (
          <li key={question.id}>
            <div className="pl1 flex align-center bg-medium-hover">
              <Icon name="model" className="pr1 text-brand" size={12} />
              <a
                className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
                onClick={() => show("model", question)}
              >
                {question.name}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <div className="pl1 mt2 flex align-center justify-between">
        <div className="flex align-center">
          <Icon name="table" className="pr1" size={12} />
          <span className="flex-full flex p1 text-bold">{jt`${tables.length} tables`}</span>
        </div>
      </div>

      <ul>
        {tables.map(table => (
          <li key={table.id}>
            <div className="pl1 flex align-center bg-medium-hover">
              <Icon name="table" className="pr1 text-brand" size={12} />
              <a
                className="flex-full flex p1 text-bold text-brand text-wrap no-decoration"
                onClick={() => show("table", table)}
              >
                {table.name}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

DatabaseTablesPane.propTypes = {
  show: PropTypes.func.isRequired,
  database: PropTypes.object.isRequired,
  questions: PropTypes.object,
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
