import React from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import { createSelector } from "reselect";
import PropTypes from "prop-types";

import { getMetadata } from "metabase/selectors/metadata";
import MetabaseSettings from "metabase/lib/settings";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Question from "metabase-lib/lib/Question";
import {
  ModelPaneField,
  ModelPaneDetail,
  ModelPaneDetailText,
  ModelPaneIcon,
  ModelPaneDescription,
  ModelPaneColumnsTitle,
  ModelPaneColumnIcon,
  ModelPaneColumns,
} from "./ModelPane.styled";

const getQuestion = createSelector(
  [getMetadata, (_state, model) => model],
  (metadata, model) => new Question(model, metadata),
);

const mapStateToProps = (state, props) => ({
  question: getQuestion(state, props.model),
});

const propTypes = {
  show: PropTypes.func.isRequired,
  model: PropTypes.object.isRequired,
  question: PropTypes.object.isRequired,
};

const ModelPane = ({ show, model, question }) => {
  const table = question.table();
  return (
    <div>
      <ModelPaneDescription>
        {question.description() || t`No description`}
      </ModelPaneDescription>
      <ModelPaneDetail>
        <a href={question.getUrl()}>
          <ModelPaneIcon name="label" size="14" />
          <ModelPaneDetailText>{t`See it`}</ModelPaneDetailText>
        </a>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="label" size="14" />
        <ModelPaneDetailText>{jt`ID #${question.id()}`}</ModelPaneDetailText>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="label" size="14" />
        <ModelPaneDetailText>{jt`Last edited ${formatDate(
          question.lastEditInfo().timestamp,
        )}`}</ModelPaneDetailText>
      </ModelPaneDetail>
      {table && (
        <ModelPaneColumns>
          <ModelPaneColumnsTitle>
            <ModelPaneIcon name="label" size="14" />
            <ModelPaneDetailText>{jt`${table.fields.length} columns`}</ModelPaneDetailText>
          </ModelPaneColumnsTitle>
          <ul>
            {table.fields.map(field => (
              <ModelPaneField key={field.id}>
                <a onClick={() => show("field", field)}>
                  <ModelPaneColumnIcon name="label" size="14" />
                  <ModelPaneDetailText>
                    {field.displayName()}
                  </ModelPaneDetailText>
                </a>
              </ModelPaneField>
            ))}
          </ul>
        </ModelPaneColumns>
      )}
    </div>
  );
};

ModelPane.propTypes = propTypes;

export default connect(mapStateToProps)(ModelPane);

// This formats a timestamp as a date using any custom formatting options.
function formatDate(value) {
  const options = MetabaseSettings.get("custom-formatting")["type/Temporal"];
  return formatDateTimeWithUnit(value, "day", options);
}
