import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Description,
  EmptyDescription,
} from "metabase/common/components/MetadataInfo/MetadataInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getUniqueFieldId } from "metabase-lib/v1/metadata/utils/fields";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Card, IconName } from "metabase-types/api";

import { FieldList } from "../FieldList";
import { NodeListTitleText } from "../NodeList";
import type {
  DataReferencePaneProps,
  DataReferenceQuestionItem,
  UniqueFieldId,
} from "../types";

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
    data: table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useGetTableQueryMetadataQuery({
    id: getQuestionVirtualTableId(id),
  });
  const {
    data: collection,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useGetCollectionQuery(
    card ? { id: card.collection_id ?? "root" } : skipToken,
  );
  const isLoading = isLoadingCard || isLoadingTable || isLoadingCollection;
  const error = cardError ?? tableError ?? collectionError;

  if (card == null || table == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const lastEditInfo = card["last-edit-info"];

  return (
    <SidebarContent
      title={card.name || undefined}
      icon={getIcon(card)}
      onBack={onBack}
      onClose={onClose}
    >
      <Box pl="lg" pr="lg">
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
        {table.fields && (
          <FieldList
            table={table}
            fields={table.fields}
            onFieldClick={(field) => {
              onItemClick({
                type: "field",
                id:
                  typeof field.id === "number"
                    ? field.id
                    : // `getUniqueFieldId` returns the same synthetic string key
                      // the field list renders with, which is what a non-numeric
                      // field id means here.
                      (getUniqueFieldId(field) as UniqueFieldId),
              });
            }}
          />
        )}
      </Box>
    </SidebarContent>
  );
};
