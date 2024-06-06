import { jt, t } from "ttag";
import _ from "underscore";

import DateTime from "metabase/components/DateTime";
import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import Collections from "metabase/entities/collections";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type { IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Collection } from "metabase-types/api/collection";
import type { State } from "metabase-types/store";

import FieldList from "../FieldList";
import { PaneContent } from "../Pane.styled";

import {
  QuestionPaneDescription,
  QuestionPaneDetail,
  QuestionPaneDetailLink,
  QuestionPaneDetailLinkText,
  QuestionPaneDetailText,
  QuestionPaneIcon,
} from "./QuestionPane.styled";

interface QuestionPaneProps {
  onItemClick: (type: string, item: unknown) => void;
  onBack: () => void;
  onClose: () => void;
  question: Question;
  table: Table;
  collection: Collection | null;
}

const getIcon = (question: Question): IconName => {
  const type = question.type();

  if (type === "question") {
    return "table";
  }

  if (type === "model") {
    return "model";
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

const QuestionPane = ({
  onItemClick,
  question,
  table,
  collection,
  onBack,
  onClose,
}: QuestionPaneProps) => {
  return (
    <SidebarContent
      title={question.displayName() || undefined}
      icon={getIcon(question)}
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
            href={ML_Urls.getUrl(question)}
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
          <QuestionPaneIcon name="collection" />
          <QuestionPaneDetailText>
            {collection?.name ?? t`Our analytics`}
          </QuestionPaneDetailText>
        </QuestionPaneDetail>
        {question.lastEditInfo() && (
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
        )}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: (_state: State, props: QuestionPaneProps) => props.question.id,
  }),
  Tables.load({
    id: (_state: State, props: QuestionPaneProps) =>
      getQuestionVirtualTableId(props.question.id()),
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
  }),
  Collections.load({
    id: (_state: State, props: QuestionPaneProps) =>
      props.question.collectionId(),
    loadingAndErrorWrapper: false,
  }),
)(QuestionPane);
