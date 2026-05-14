import { Fragment, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useExtractSourcesQuery,
  useGetCardQuery,
  useGetDatabaseQuery,
  useGetFieldTableIdsQuery,
  useGetTableQuery,
  useSubmitMetabotSourceFeedbackMutation,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import {
  getCollectionLocationParts,
  getDatabaseLocationParts,
} from "metabase/common/utils/source-location";
import { getMetabotId } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import {
  ActionIcon,
  Collapse,
  Flex,
  Icon,
  Skeleton,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatasetQuery,
  IconName,
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  MetabotSourceFeedback,
  NativeDatasetQuery,
  TemplateTags,
} from "metabase-types/api";

import S from "./MetabotAgentDataPartMessage.module.css";

type DecodedQuery =
  | {
      kind: "mbql";
      tableIds: number[];
      cardIds: number[];
      fieldIds: number[];
    }
  | {
      kind: "native";
      databaseId: number;
      sql: string;
      templateTags?: TemplateTags;
    }
  | { kind: "none" };

const uniqueNumbers = (ids: number[]) =>
  Array.from(new Set(ids)).sort((a, b) => a - b);

type SourceFeedbackTarget = Pick<
  MetabotSourceFeedback,
  "source_id" | "source_type"
>;

const isNativeDatasetQuery = (
  datasetQuery: DatasetQuery,
): datasetQuery is NativeDatasetQuery =>
  "type" in datasetQuery && datasetQuery.type === "native";

const decodeQueryFromPath = (path: string): DecodedQuery => {
  try {
    const datasetQuery = deserializeCardFromQuery(path).dataset_query;
    if (!datasetQuery) {
      return { kind: "none" };
    }

    if (isNativeDatasetQuery(datasetQuery)) {
      const sql = datasetQuery.native.query;
      const databaseId = datasetQuery.database;
      if (typeof sql === "string" && typeof databaseId === "number") {
        return {
          kind: "native",
          databaseId,
          sql,
          templateTags: datasetQuery.native["template-tags"],
        };
      }
      return { kind: "none" };
    }

    const question = Question.create({ dataset_query: datasetQuery });
    const query = question.query();

    const tableIds = uniqueNumbers(Lib.allSourceTableIds(query));
    const cardIds = uniqueNumbers(Lib.allSourceCardIds(query));
    const fieldIds = uniqueNumbers(Lib.allFieldIds(query));

    return {
      kind: "mbql",
      tableIds,
      cardIds,
      fieldIds,
    };
  } catch {
    return { kind: "none" };
  }
};

const SourceItem = ({
  iconName,
  label,
  location,
  messageId,
  source,
  to,
}: {
  iconName: IconName;
  label: string;
  location?: {
    parts: string[];
  };
  messageId?: string;
  source: SourceFeedbackTarget;
  to: string;
}) => {
  return (
    <Flex
      className={S.sourceDataRow}
      align="center"
      justify="space-between"
      gap="sm"
      w="100%"
      mih="3.25rem"
      p="0.5rem"
      bg="background-secondary"
    >
      <ForwardRefLink
        aria-label={label}
        className={S.sourceItemLink}
        style={{
          display: "inline-flex",
          maxWidth: "100%",
          minWidth: 0,
          color: "var(--mb-color-text-primary)",
          textDecoration: "none",
          borderRadius: "0.25rem",
        }}
        to={to}
        href={to}
      >
        <Flex direction="column" gap="0.25rem" miw={0} maw="100%">
          <Flex gap="sm" align="center" miw={0} maw="100%">
            <Icon
              name={iconName}
              size={12}
              c="text-primary"
              style={{ display: "block", flexShrink: 0 }}
              aria-hidden
            />
            <Text
              component="span"
              className={S.sourceItemTitleText}
              miw={0}
              style={{
                overflow: "hidden",
                fontSize: "0.75rem",
                fontWeight: 700,
                lineHeight: 1,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Text>
          </Flex>
          {location && (
            <Flex
              align="center"
              gap="0.25rem"
              maw="100%"
              miw={0}
              pl="1.25rem"
              c="text-secondary"
            >
              {location.parts.map((part, index) => (
                <Fragment key={`${part}-${index}`}>
                  {index > 0 && (
                    <Icon
                      name="chevronright"
                      size={8}
                      c="text-secondary"
                      style={{ display: "block", flexShrink: 0 }}
                      aria-hidden
                    />
                  )}
                  <Text
                    component="span"
                    miw={0}
                    c="text-secondary"
                    style={{
                      overflowX: "hidden",
                      fontSize: "0.75rem",
                      lineHeight: 1,
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {part}
                  </Text>
                </Fragment>
              ))}
            </Flex>
          )}
        </Flex>
      </ForwardRefLink>
      {messageId && (
        <SourceFeedbackButtons messageId={messageId} source={source} />
      )}
    </Flex>
  );
};

const SourceItemSkeleton = ({ hasFeedback }: { hasFeedback?: boolean }) => {
  return (
    <Flex
      className={S.sourceDataRow}
      align="center"
      justify="space-between"
      gap="sm"
      w="100%"
      mih="3.25rem"
      p="0.5rem"
      bg="background-secondary"
      aria-hidden
      data-testid="metabot-source-item-skeleton"
    >
      <Flex direction="column" gap="0.375rem" miw={0} maw="100%">
        <Flex gap="sm" align="center" miw={0} maw="100%">
          <Skeleton w={12} h={12} radius="xs" />
          <Skeleton w="7rem" h="0.75rem" radius="xs" />
        </Flex>
        <Flex pl="1.25rem">
          <Skeleton w="10rem" h="0.75rem" radius="xs" />
        </Flex>
      </Flex>
      {hasFeedback && (
        <Flex gap="xs" align="center" style={{ flexShrink: 0 }}>
          <Skeleton w={24} h={24} radius="sm" />
          <Skeleton w={24} h={24} radius="sm" />
        </Flex>
      )}
    </Flex>
  );
};

const SourceFeedbackButtons = ({
  messageId,
  source,
}: {
  messageId: string;
  source: SourceFeedbackTarget;
}) => {
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [sendToast] = useToast();
  const metabotId = useSelector(getMetabotId);
  const [submitMetabotSourceFeedback, { isLoading }] =
    useSubmitMetabotSourceFeedbackMutation();

  const submitFeedback = async (positive: boolean) => {
    if (feedback === positive) {
      return;
    }

    const previousFeedback = feedback;
    setFeedback(positive);

    try {
      await submitMetabotSourceFeedback({
        metabot_id: metabotId,
        message_id: messageId,
        positive,
        ...source,
      }).unwrap();
    } catch {
      setFeedback(previousFeedback);
      sendToast({ icon: "warning", message: t`Failed to submit feedback` });
    }
  };

  return (
    <Flex gap="xs" align="center" style={{ flexShrink: 0 }}>
      <Tooltip label={t`Source is correct`}>
        <ActionIcon
          aria-label={t`Source is correct`}
          size={24}
          variant="default"
          className={S.sourceFeedbackButton}
          data-active={feedback === true || undefined}
          bdrs="sm"
          style={{
            boxShadow: "0 1px 3px 0 #00000012",
          }}
          disabled={isLoading}
          onClick={() => {
            void submitFeedback(true);
          }}
        >
          <Icon name="thumbs_up" size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t`Source is wrong`}>
        <ActionIcon
          aria-label={t`Source is wrong`}
          size={24}
          variant="default"
          className={S.sourceFeedbackButton}
          data-active={feedback === false || undefined}
          bdrs="sm"
          style={{
            boxShadow: "0 1px 3px 0 #00000012",
          }}
          disabled={isLoading}
          onClick={() => {
            void submitFeedback(false);
          }}
        >
          <Icon name="thumbs_down" size={12} />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );
};

const TableSourceRow = ({
  id,
  messageId,
}: {
  id: number;
  messageId?: string;
}) => {
  const { data: table, isLoading, isError } = useGetTableQuery({ id });
  const {
    data: database,
    isLoading: isLoadingDatabase,
    isError: isErrorDatabase,
  } = useGetDatabaseQuery(
    table?.db_id != null ? { id: table?.db_id } : skipToken,
  );

  if (isLoading || isLoadingDatabase) {
    return <SourceItemSkeleton hasFeedback={Boolean(messageId)} />;
  }

  if (isError || isErrorDatabase || !database || !table) {
    return null;
  }

  const location = table?.collection?.name
    ? {
        parts: getCollectionLocationParts(table.collection.name),
      }
    : {
        parts: getDatabaseLocationParts({
          databaseName: database.name,
          schema: table?.schema,
        }),
      };

  return (
    <SourceItem
      iconName="table"
      label={table.display_name}
      location={location}
      messageId={messageId}
      source={{ source_id: id, source_type: "table" }}
      to={Urls.tableRowsQuery(table.db_id, id)}
    />
  );
};

const CardPill = ({ id, messageId }: { id: number; messageId?: string }) => {
  const { data: card, isLoading, isError } = useGetCardQuery({ id });

  if (isLoading) {
    return <SourceItemSkeleton hasFeedback={Boolean(messageId)} />;
  }

  if (isError || !card) {
    return null;
  }

  const iconName: IconName =
    card.type === "model"
      ? "model"
      : card.type === "metric"
        ? "metric"
        : "table2";

  return (
    <SourceItem
      iconName={iconName}
      label={card?.name}
      location={{
        parts: getCollectionLocationParts(card.collection?.name),
      }}
      messageId={messageId}
      source={{
        source_id: id,
        source_type: card.type === "model" ? "model" : "card",
      }}
      to={Urls.card(card)}
    />
  );
};

const SourceDataSection = ({ children }: { children: React.ReactNode }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Flex
      direction="column"
      miw={0}
      w="100%"
      bg="background-secondary"
      style={{
        borderRadius: "0.5rem",
        overflow: "hidden",
        border: "1px solid var(--mb-color-border)",
      }}
    >
      <UnstyledButton
        aria-label={
          isExpanded ? t`Collapse data sources` : t`Expand data sources`
        }
        aria-expanded={isExpanded}
        className={S.sourceDataHeader}
        data-expanded={isExpanded}
        type="button"
        w="100%"
        mih="1.75rem"
        px="0.5rem"
        bg="background-primary"
        onClick={() => setIsExpanded((isExpanded) => !isExpanded)}
      >
        <Flex align="center" justify="space-between" w="100%">
          <Flex gap="sm" align="center" miw={0}>
            <Icon name="database" size={12} c="text-secondary" aria-hidden />
            <Text
              component="span"
              miw={0}
              c="text-secondary"
              fz="0.75rem"
              lh="0.75rem"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t`Data sources used`}
            </Text>
          </Flex>
          <Icon
            name={isExpanded ? "chevronup" : "chevrondown"}
            size={12}
            c="text-secondary"
            style={{ flexShrink: 0 }}
            aria-hidden
          />
        </Flex>
      </UnstyledButton>
      <Collapse in={isExpanded} mah="11rem" style={{ overflow: "auto" }}>
        <Flex direction="column" w="100%">
          {children}
        </Flex>
      </Collapse>
    </Flex>
  );
};

const MbqlSourcesRow = ({
  tableIds,
  cardIds,
  fieldIds,
  messageId,
}: {
  tableIds: number[];
  cardIds: number[];
  fieldIds: number[];
  messageId?: string;
}) => {
  const {
    data: fieldTableIdsResponse,
    isLoading,
    isError,
  } = useGetFieldTableIdsQuery(
    fieldIds.length > 0 ? { field_ids: fieldIds } : skipToken,
  );

  if (isLoading) {
    const skeletonCount = Math.max(
      4,
      tableIds.length + cardIds.length + fieldIds.length,
    );

    return (
      <SourceDataSection>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <SourceItemSkeleton
            key={`source-skeleton-${index}`}
            hasFeedback={Boolean(messageId)}
          />
        ))}
      </SourceDataSection>
    );
  }

  if (isError) {
    return null;
  }

  const allTableIds = uniqueNumbers(
    tableIds.concat(fieldTableIdsResponse?.table_ids ?? []),
  );

  return (
    <SourceDataSection>
      {allTableIds.map((id) => (
        <TableSourceRow key={`t-${id}`} id={id} messageId={messageId} />
      ))}
      {cardIds.map((id) => (
        <CardPill id={id} key={id} messageId={messageId} />
      ))}
    </SourceDataSection>
  );
};

const NativeSourcesRow = ({
  databaseId,
  messageId,
  sql,
  templateTags,
}: {
  databaseId: number;
  messageId?: string;
  sql: string;
  templateTags?: TemplateTags;
}) => {
  const { data, isLoading } = useExtractSourcesQuery({
    database_id: databaseId,
    sql,
    ...(templateTags ? { template_tags: templateTags } : {}),
  });
  const { data: database } = useGetDatabaseQuery({ id: databaseId });
  const tables = data?.tables ?? [];
  const cardIds = data?.card_ids ?? [];

  if (isLoading) {
    return (
      <SourceDataSection>
        <SourceItemSkeleton hasFeedback={Boolean(messageId)} />
      </SourceDataSection>
    );
  }

  if (tables.length === 0 && cardIds.length === 0) {
    return null;
  }

  return (
    <SourceDataSection>
      {tables.map((table) => {
        const label = table.display_name || table.name;
        const databaseName = database?.name;
        const location = databaseName
          ? {
              parts: getDatabaseLocationParts({
                databaseName,
                schema: table.schema,
              }),
            }
          : undefined;

        return (
          <SourceItem
            key={table.id}
            iconName="table"
            label={label}
            location={location}
            messageId={messageId}
            source={{ source_id: table.id, source_type: "table" }}
            to={Urls.tableRowsQuery(databaseId, table.id)}
          />
        );
      })}
      {cardIds.map((id) => (
        <CardPill id={id} key={`c-${id}`} messageId={messageId} />
      ))}
    </SourceDataSection>
  );
};

export const NavigateToTablePills = ({
  messageId,
  path,
}: {
  messageId?: string;
  path: string;
}) => {
  const decoded = useMemo(() => decodeQueryFromPath(path), [path]);

  if (decoded.kind === "none") {
    return null;
  }

  if (decoded.kind === "native") {
    return (
      <NativeSourcesRow
        databaseId={decoded.databaseId}
        messageId={messageId}
        sql={decoded.sql}
        templateTags={decoded.templateTags}
      />
    );
  }

  const hasContent =
    decoded.tableIds.length > 0 ||
    decoded.cardIds.length > 0 ||
    decoded.fieldIds.length > 0;
  if (!hasContent) {
    return null;
  }

  return (
    <MbqlSourcesRow
      tableIds={decoded.tableIds}
      cardIds={decoded.cardIds}
      fieldIds={decoded.fieldIds}
      messageId={messageId}
    />
  );
};

export const CodeEditTablePills = ({
  buffer,
  messageId,
  value,
}: {
  buffer: MetabotCodeEditorBufferContext | undefined;
  messageId?: string;
  value: MetabotCodeEdit;
}) => {
  const databaseId = buffer?.source.database_id;
  if (typeof databaseId !== "number") {
    return null;
  }

  return (
    <NativeSourcesRow
      databaseId={databaseId}
      messageId={messageId}
      sql={value.value}
    />
  );
};
