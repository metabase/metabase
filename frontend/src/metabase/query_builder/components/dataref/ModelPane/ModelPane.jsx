import React from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import PropTypes from "prop-types";

import DateTime from "metabase/components/DateTime";
import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import { getQuestionFromCard } from "metabase/query_builder/selectors";
import FieldList from "../FieldList";
import {
  ModelPaneDetail,
  ModelPaneDetailLink,
  ModelPaneDetailLinkText,
  ModelPaneDetailText,
  ModelPaneIcon,
  ModelPaneDescription,
} from "./ModelPane.styled";

const mapStateToProps = (state, props) => ({
  question: getQuestionFromCard(state, props.model),
});

const propTypes = {
  show: PropTypes.func.isRequired,
  model: PropTypes.object.isRequired,
  question: PropTypes.object.isRequired,
};

const ModelPane = ({ show, question }) => {
  const table = question.table();
  return (
    <div>
      <ModelPaneDescription>
        {question.description() ? (
          <Description>{question.description()}</Description>
        ) : (
          <EmptyDescription>{t`No description`}</EmptyDescription>
        )}
      </ModelPaneDescription>
      <ModelPaneDetail>
        <ModelPaneDetailLink
          href={question.getUrl()}
          target="_blank"
          rel="noreferrer"
        >
          <ModelPaneIcon name="share" />
          <ModelPaneDetailLinkText>{t`See it`}</ModelPaneDetailLinkText>
        </ModelPaneDetailLink>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="label" />
        <ModelPaneDetailText>{t`ID #${question.id()}`}</ModelPaneDetailText>
      </ModelPaneDetail>
      <ModelPaneDetail>
        <ModelPaneIcon name="calendar" />
        <ModelPaneDetailText>
          {jt`Last edited ${(
            <DateTime
              key="day"
              unit="day"
              value={question.lastEditInfo().timestamp}
            />
          )}`}
        </ModelPaneDetailText>
      </ModelPaneDetail>
      {table?.fields && (
        <FieldList fields={table.fields} onFieldClick={f => show("field", f)} />
      )}
    </div>
  );
};

ModelPane.propTypes = propTypes;

export default connect(mapStateToProps)(ModelPane);
