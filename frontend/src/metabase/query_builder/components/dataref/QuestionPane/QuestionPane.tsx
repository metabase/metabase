import { match } from "ts-pattern";
import { jt, t } from "ttag";
import _ from "underscore";

import DateTime from "metabase/components/DateTime";
import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo";
import Collections from "metabase/entities/collections";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { Box, Flex, Icon, type IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Collection } from "metabase-types/api/collection";
import type { State } from "metabase-types/store";

import FieldList from "../FieldList";
import { NodeListTitleText } from "../NodeList";

import S from "./QuestionPane.module.css";

interface QuestionPaneProps {
  onItemClick: (type: string, item: unknown) => void;
  onBack: () => void;
  onClose: () => void;
  question: Question;
  table: Table;
  collection: Collection | null;
}

const getIcon = (question: Question): IconName => {
  return match(question.type())
    .returnType<IconName>()
    .with("question", () => "table")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .exhaustive();
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
      <Box pl="lg" pr="lg">
        <Box p="0 0.5rem 1rem 0.5rem">
          {question.description() ? (
            <Description>{question.description()}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </Box>
        <Flex
          color="var(--mb-color-text-medium)"
          align="center"
          p="0.25rem 0.5rem"
          fw={700}
        >
          <a
            className={S.QuestionPaneDetailLink}
            href={ML_Urls.getUrl(question)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon className={S.QuestionPaneIcon} name="share" />
            <NodeListTitleText>{t`See it`}</NodeListTitleText>
          </a>
        </Flex>
        <Flex
          color="var(--mb-color-text-medium)"
          align="center"
          p="0.25rem 0.5rem"
          fw={700}
        >
          <Icon className={S.QuestionPaneIcon} name="label" />
          <Box
            component="span"
            ml="sm"
            fw="normal"
          >{t`ID #${question.id()}`}</Box>
        </Flex>
        <Flex
          color="var(--mb-color-text-medium)"
          align="center"
          p="0.25rem 0.5rem"
          fw={700}
        >
          <Icon className={S.QuestionPaneIcon} name="collection" />
          <Box component="span" ml="sm" fw="normal">
            {collection?.name ?? t`Our analytics`}
          </Box>
        </Flex>
        {question.lastEditInfo() && (
          <Flex
            color="var(--mb-color-text-medium)"
            align="center"
            p="0.25rem 0.5rem"
            fw={700}
          >
            <Icon className={S.QuestionPaneIcon} name="calendar" />
            <Box component="span" ml="sm" fw="normal">
              {jt`Last edited ${(
                <DateTime
                  key="day"
                  unit="day"
                  value={question.lastEditInfo().timestamp}
                />
              )}`}
            </Box>
          </Flex>
        )}
        {table.fields && (
          <FieldList
            fields={table.fields}
            onFieldClick={f => onItemClick("field", f)}
          />
        )}
      </Box>
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
