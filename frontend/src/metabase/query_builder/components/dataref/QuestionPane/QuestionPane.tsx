import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Description,
  EmptyDescription,
} from "metabase/common/components/MetadataInfo/MetadataInfo";
import { useSelector } from "metabase/lib/redux";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, type IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import Field from "metabase-lib/v1/metadata/Field";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { CardId } from "metabase-types/api";

import { FieldList } from "../FieldList";
import { NodeListTitleText } from "../NodeList";

import S from "./QuestionPane.module.css";

type QuestionItem = {
  id: CardId;
};

type QuestionPaneProps = {
  question: QuestionItem;
  onItemClick: (type: string, item: unknown) => void;
  onBack: () => void;
  onClose: () => void;
};

const getIcon = (question: Question): IconName => {
  return match(question.type())
    .returnType<IconName>()
    .with("question", () => "table")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .exhaustive();
};

export const QuestionPane = ({
  question: { id },
  onBack,
  onItemClick,
  onClose,
}: QuestionPaneProps) => {
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({ id });
  const { isLoading: isLoadingMetadata, error: metadataError } =
    useGetCardQueryMetadataQuery(id);
  const {
    data: collection,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useGetCollectionQuery(
    card ? { id: card.collection_id ?? "root" } : skipToken,
  );
  const isLoading = isLoadingCard || isLoadingMetadata || isLoadingCollection;
  const error = cardError ?? metadataError ?? collectionError;
  const metadata = useSelector(getMetadata);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const question = metadata.question(id);
  if (question == null) {
    return <LoadingAndErrorWrapper loading />;
  }

  const result_metadata = question.card().result_metadata;
  const fields = result_metadata?.map((data) => new Field(data));

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
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
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
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
          <Icon className={S.QuestionPaneIcon} name="label" />
          <Box
            component="span"
            ml="sm"
            fw="normal"
          >{t`ID #${question.id()}`}</Box>
        </Flex>
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
          <Icon className={S.QuestionPaneIcon} name="collection" />
          <Box component="span" ml="sm" fw="normal">
            {collection?.name ?? t`Our analytics`}
          </Box>
        </Flex>
        {question.lastEditInfo() && (
          <Flex
            color="text-secondary"
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
        {fields && (
          <FieldList
            fields={fields}
            onFieldClick={(f) => onItemClick("field", f)}
          />
        )}
      </Box>
    </SidebarContent>
  );
};
