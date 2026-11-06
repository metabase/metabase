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
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useMetadataProvider } from "metabase/metadata-store";
import { Box, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card, IconName } from "metabase-types/api";

import { FieldList } from "../FieldList";
import { NodeListTitleText } from "../NodeList";
import type {
  DataReferencePaneProps,
  DataReferenceQuestionItem,
} from "../types";
import { getCardColumnListInfo } from "../utils";

import S from "./QuestionPane.module.css";

const getIcon = (card: Card): IconName => {
  return match(card.type)
    .returnType<IconName>()
    .with("question", () => "table")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .exhaustive();
};

export const QuestionPane = ({
  id,
  onBack,
  onItemClick,
  onClose,
}: DataReferencePaneProps<DataReferenceQuestionItem>) => {
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({
    id,
  });
  const {
    data: cardMetadata,
    isLoading: isLoadingCardMetadata,
    error: cardMetadataError,
  } = useGetCardQueryMetadataQuery(id);
  const metadataProvider = useMetadataProvider(card?.database_id ?? null);
  const {
    data: collection,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useGetCollectionQuery(
    card ? { id: card.collection_id ?? "root" } : skipToken,
  );
  const isLoading =
    isLoadingCard || isLoadingCardMetadata || isLoadingCollection;
  const error = cardError ?? cardMetadataError ?? collectionError;

  if (card == null || cardMetadata == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const columnListInfo = getCardColumnListInfo(metadataProvider, card.id);
  const lastEditInfo = card["last-edit-info"];

  const handleColumnClick = (columnIndex: number) => {
    onItemClick({ type: "field", cardId: card.id, columnIndex });
  };

  return (
    <SidebarContent
      title={card.name || undefined}
      icon={getIcon(card)}
      onBack={onBack}
      onClose={onClose}
    >
      <Box pl="xl" pr="xl">
        <Box p="0 0.5rem 1rem 0.5rem">
          {card.description ? (
            <Description>{card.description}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </Box>
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
          <a
            className={S.QuestionPaneDetailLink}
            href={Urls.card(card)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon className={S.QuestionPaneIcon} name="share" />
            <NodeListTitleText>{t`See it`}</NodeListTitleText>
          </a>
        </Flex>
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
          <Icon className={S.QuestionPaneIcon} name="label" />
          <Box component="span" ml="sm" fw="normal">{t`ID #${card.id}`}</Box>
        </Flex>
        <Flex color="text-secondary" align="center" p="0.25rem 0.5rem" fw={700}>
          <Icon className={S.QuestionPaneIcon} name="collection" />
          <Box component="span" ml="sm" fw="normal">
            {collection?.name ?? t`Our analytics`}
          </Box>
        </Flex>
        {lastEditInfo && (
          <Flex
            color="text-secondary"
            align="center"
            p="0.25rem 0.5rem"
            fw={700}
          >
            <Icon className={S.QuestionPaneIcon} name="calendar" />
            <Box component="span" ml="sm" fw="normal">
              {jt`Last edited ${(
                <DateTime key="day" unit="day" value={lastEditInfo.timestamp} />
              )}`}
            </Box>
          </Flex>
        )}
        {columnListInfo && (
          <FieldList
            query={columnListInfo.query}
            stageIndex={columnListInfo.stageIndex}
            columns={columnListInfo.columns}
            onColumnClick={handleColumnClick}
          />
        )}
      </Box>
    </SidebarContent>
  );
};
