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
import type { State } from "metabase-types/store";
import Table from "metabase-lib/lib/metadata/Table";
import Question from "metabase-lib/lib/Question";
import FieldList from "../FieldList";
import { PaneContent } from "../Pane.styled";
import {
  QuestionPaneDetail,
  QuestionPaneDetailLink,
  QuestionPaneDetailLinkText,
  QuestionPaneDetailText,
  QuestionPaneIcon,
  QuestionPaneDescription,
} from "./QuestionPane.styled";

interface QuestionPaneProps {
  onItemClick: (type: string, item: unknown) => void;
  onBack: () => void;
  onClose: () => void;
  question: Question;
}

const mapStateToProps = (state: State, props: QuestionPaneProps) => ({
  question: getQuestionFromCard(state, props.question),
});

const QuestionPane = ({
  onItemClick,
  question,
  onBack,
  onClose,
}: QuestionPaneProps) => {
  const table = question.composeThisQuery()?.table() as Table; // ? is only needed to satisfy type-checker
  return (
    <SidebarContent
      title={question.displayName() || undefined}
      icon={question.isDataset() ? "model" : "table"}
      onBack={onBack}
      onClose={onClose}
    >
      <PaneContent>
        <QuestionPaneDescription>
          {question.description() ? (
            <Description>{question.description()}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </QuestionPaneDescription>
        <QuestionPaneDetail>
          <QuestionPaneDetailLink
            href={question.getUrl()}
            target="_blank"
            rel="noreferrer"
          >
            <QuestionPaneIcon name="share" />
            <QuestionPaneDetailLinkText>{t`See it`}</QuestionPaneDetailLinkText>
          </QuestionPaneDetailLink>
        </QuestionPaneDetail>
        <QuestionPaneDetail>
          <QuestionPaneIcon name="label" />
          <QuestionPaneDetailText>{t`ID #${question.id()}`}</QuestionPaneDetailText>
        </QuestionPaneDetail>
        <QuestionPaneDetail>
          <QuestionPaneIcon name="calendar" />
          <QuestionPaneDetailText>
            {jt`Last edited ${(
              <DateTime
                key="day"
                unit="day"
                value={question.lastEditInfo().timestamp}
              />
            )}`}
          </QuestionPaneDetailText>
        </QuestionPaneDetail>
        {table.fields && (
          <FieldList
            fields={table.fields}
            onFieldClick={f => onItemClick("field", f)}
          />
        )}
      </PaneContent>
    </SidebarContent>
  );
};

export default _.compose(
  Questions.load({
    id: (_state: State, props: QuestionPaneProps) => props.question.id,
  }),
  connect(mapStateToProps),
)(QuestionPane);
