import React from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import { createSelector } from "reselect";
import PropTypes from "prop-types";

import { getMetadata } from "metabase/selectors/metadata";
import MetabaseSettings from "metabase/lib/settings";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Question from "metabase-lib/lib/Question";
import FieldList from "../FieldList";
import {
  ModelPaneDetail,
  ModelPaneDetailLink,
  ModelPaneDetailText,
  ModelPaneIcon,
  ModelPaneDescription,
} from "./ModelPane.styled";

// This formats a timestamp as a date using any custom formatting options.
function formatDate(value) {
  const options = MetabaseSettings.get("custom-formatting")["type/Temporal"];
  return formatDateTimeWithUnit(value, "day", options);
}

const getQuestion = createSelector(
  [getMetadata, (_state, card) => card],
  (metadata, card) => new Question(card, metadata),
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
          <ModelPaneIcon name="share" />
          <ModelPaneDetailLink>{t`See it`}</ModelPaneDetailLink>
        </a>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="label" />
        <ModelPaneDetailText>{jt`ID #${question.id()}`}</ModelPaneDetailText>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="calendar" />
        <ModelPaneDetailText>{jt`Last edited ${formatDate(
          question.lastEditInfo().timestamp,
        )}`}</ModelPaneDetailText>
      </ModelPaneDetail>
      {table?.fields && (
        <FieldList
          fields={table.fields}
          handleFieldClick={field => show("field", field)}
        />
      )}
    </div>
  );
};

ModelPane.propTypes = propTypes;

export default connect(mapStateToProps)(ModelPane);
