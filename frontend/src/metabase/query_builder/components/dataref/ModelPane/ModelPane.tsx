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
import SidebarContent from "metabase/query_builder/components/SidebarContent";
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
  onItemClick: (type: string, item: unknown) => void;
  onBack: any;
  onClose: any;
  model: Card;
  question: Question;
}

const mapStateToProps = (state: State, props: ModelPaneProps) => ({
  question: getQuestionFromCard(state, props.model),
});

const ModelPane = ({
  onItemClick,
  question,
  onBack,
  onClose,
}: ModelPaneProps) => {
  const table = question.table();
  return (
    <SidebarContent
      title={question.displayName() || undefined}
      icon={"model"}
      onBack={onBack}
      onClose={onClose}
    >
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
        <FieldList
          fields={table.fields}
          onFieldClick={f => onItemClick("field", f)}
        />
      )}
    </SidebarContent>
  );
};

export default _.compose(
  Questions.load({
    id: (_state: State, props: ModelPaneProps) => props.model.id,
    entityAlias: "model",
  }),
  connect(mapStateToProps),
)(ModelPane);
