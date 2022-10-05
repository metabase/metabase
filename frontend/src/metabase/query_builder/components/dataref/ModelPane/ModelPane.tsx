import React from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import DateTime from "metabase/components/DateTime";
import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import Questions from "metabase/entities/questions";
import { getQuestionFromCard } from "metabase/query_builder/selectors";
import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";
import Question from "metabase-lib/lib/Question";
import FieldList from "../FieldList";
import {
  ModelPaneDetail,
  ModelPaneDetailLink,
  ModelPaneDetailLinkText,
  ModelPaneDetailText,
  ModelPaneIcon,
  ModelPaneDescription,
} from "./ModelPane.styled";

interface ModelPaneProps {
  show: (type: string, item: unknown) => void;
  model: Card;
  question: Question;
}

const mapStateToProps = (state: State, props: ModelPaneProps) => ({
  question: getQuestionFromCard(state, props.model),
});

const ModelPane = ({ show, question }: ModelPaneProps) => {
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

export default _.compose(
  Questions.load({
    id: (_state: State, props: ModelPaneProps) => props.model.id,
    entityAlias: "model",
  }),
  connect(mapStateToProps),
)(ModelPane);
