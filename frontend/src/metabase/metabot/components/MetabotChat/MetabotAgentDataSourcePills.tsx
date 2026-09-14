import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import {
  skipToken,
  useExtractSourcesQuery,
  useGetDatabaseQuery,
  useGetFieldTableIdsQuery,
} from "metabase/api";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useToast } from "metabase/common/hooks";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { useGetIcon } from "metabase/hooks/use-icon";
import { getMetabotId } from "metabase/metabot/state";
import {
  getCollectionLocationLabel,
  getDatabaseLocationLabel,
} from "metabase/metabot/utils/source-location";
import { useSelector } from "metabase/redux";
import { EntitySmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/EntitySmartLink";
import { useEntityData } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-entity-data";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Modal,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { getName } from "metabase/utils/name";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatasetQuery,
  MetabotCodeEdit,
  MetabotCodeEditorBufferContext,
  MetabotSourceFeedback,
  NativeDatasetQuery,
  TemplateTags,
} from "metabase-types/api";

import { useSubmitMetabotSourceFeedbackMutation } from "../../api";

import S from "./MetabotAgentDataPart.module.css";

type SourceRef = { id: number; model: "table" | "card" };

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

const toSourceRefs = (tableIds: number[], cardIds: number[]): SourceRef[] => [
  ...tableIds.map((id) => ({ id, model: "table" as const })),
  ...cardIds.map((id) => ({ id, model: "card" as const })),
];

type SourceFeedbackTarget = Pick<
  MetabotSourceFeedback,
  "source_id" | "source_type"
>;

const isNativeDatasetQuery = (
  datasetQuery: DatasetQuery,
): datasetQuery is NativeDatasetQuery =>
  "type" in datasetQuery && datasetQuery.type === "native";

const decodeQuery = (datasetQuery: DatasetQuery | undefined): DecodedQuery => {
  try {
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

    return {
      kind: "mbql",
      tableIds: uniqueNumbers(Lib.allSourceTableIds(query)),
      cardIds: uniqueNumbers(Lib.allSourceCardIds(query)),
      fieldIds: uniqueNumbers(Lib.allFieldIds(query)),
    };
  } catch {
    return { kind: "none" };
  }
};

type Source = {
  name: string;
  location: string;
  iconModel: "table" | "dataset" | "metric" | "card";
  feedbackTarget: SourceFeedbackTarget;
};

const useSource = ({ id, model }: SourceRef) => {
  const data = useEntityData(id, model);
  const databaseId = data.model === "table" ? data.entity?.db_id : undefined;
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  return match(data)
    .returnType<Source | undefined>()
    .with({ model: "table", entity: P.nonNullable }, ({ entity }) => ({
      name: entity.display_name,
      location: entity.collection?.name
        ? getCollectionLocationLabel(entity.collection.name)
        : getDatabaseLocationLabel({
            databaseName: database?.name ?? "",
            schema: entity.schema,
          }),
      iconModel: "table",
      feedbackTarget: { source_id: id, source_type: "table" },
    }))
    .with({ model: "card", entity: P.nonNullable }, ({ entity }) => ({
      name: entity.name,
      location: getCollectionLocationLabel(entity.collection?.name),
      iconModel: match(entity.type)
        .returnType<Source["iconModel"]>()
        .with("model", () => "dataset")
        .with("metric", () => "metric")
        .otherwise(() => "card"),
      feedbackTarget: {
        source_id: id,
        source_type: entity.type === "model" ? "model" : "card",
      },
    }))
    .otherwise(() => undefined);
};

const SourceSkeleton = () => (
  <Skeleton h="1.25rem" w="6rem" data-testid="metabot-source-item-skeleton" />
);

const SourceLink = ({ id, model }: SourceRef) => {
  const { entity, isLoading, error } = useEntityData(id, model);

  if (isLoading) {
    return <SourceSkeleton />;
  }
  if (error || !entity) {
    return null;
  }

  return <EntitySmartLink id={id} model={model} name={getName(entity)} />;
};

const SourceFeedbackButtons = ({
  messageId,
  source,
  size,
}: {
  messageId: string;
  source: SourceFeedbackTarget;
  size: "sm" | "md";
}) => {
  const iconSize = size === "sm" ? 12 : 16;
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
    <Group gap={size === "sm" ? 0 : "sm"} wrap="nowrap">
      <Tooltip label={t`Source is correct`}>
        <ActionIcon
          aria-label={t`Source is correct`}
          size={24}
          variant="subtle"
          bdrs="xs"
          className={S.feedbackButton}
          data-active={feedback === true || undefined}
          disabled={isLoading}
          onClick={() => void submitFeedback(true)}
        >
          <Icon name="thumbs_up" size={iconSize} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t`Source is wrong`}>
        <ActionIcon
          aria-label={t`Source is wrong`}
          size={24}
          variant="subtle"
          bdrs="xs"
          className={S.feedbackButton}
          data-active={feedback === false || undefined}
          disabled={isLoading}
          onClick={() => void submitFeedback(false)}
        >
          <Icon name="thumbs_down" size={iconSize} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

const SingleSourceFeedback = ({
  messageId,
  source: ref,
}: {
  messageId: string;
  source: SourceRef;
}) => {
  const source = useSource(ref);

  return source ? (
    <SourceFeedbackButtons
      messageId={messageId}
      source={source.feedbackTarget}
      size="sm"
    />
  ) : null;
};

const SourceFeedbackRow = ({
  messageId,
  source: ref,
}: {
  messageId: string;
  source: SourceRef;
}) => {
  const getIcon = useGetIcon();
  const source = useSource(ref);

  if (!source) {
    return null;
  }

  return (
    <Flex
      align="center"
      justify="space-between"
      gap="sm"
      px="lg"
      py="md"
      className={S.feedbackRow}
    >
      <Stack gap="xxs" miw={0}>
        <Group gap="sm" wrap="nowrap">
          <EntityIcon
            {...getIcon({ model: source.iconModel })}
            size="0.75rem"
            c="brand"
          />
          <Text fz="md" lh="sm" fw="bold" truncate>
            {source.name}
          </Text>
        </Group>
        <Text fz="sm" lh="lg" c="text-secondary" pl="1.25rem" truncate>
          {source.location}
        </Text>
      </Stack>
      <SourceFeedbackButtons
        messageId={messageId}
        source={source.feedbackTarget}
        size="md"
      />
    </Flex>
  );
};

const SourceFeedbackModal = ({
  messageId,
  sources,
  onClose,
}: {
  messageId: string;
  sources: SourceRef[];
  onClose: () => void;
}) => (
  <Modal
    opened
    onClose={onClose}
    size="lg"
    radius="lg"
    title={t`Give feedback`}
    data-testid="metabot-source-feedback-modal"
  >
    <Stack gap="lg">
      <Stack gap={0} bdrs="sm" bd="1px solid var(--mb-color-border-neutral)">
        {sources.map((source) => (
          <SourceFeedbackRow
            key={`${source.model}-${source.id}`}
            messageId={messageId}
            source={source}
          />
        ))}
      </Stack>
      <Group justify="flex-end">
        <Button variant="filled" onClick={onClose}>{t`Done`}</Button>
      </Group>
    </Stack>
  </Modal>
);

const SourcesSection = ({
  messageId,
  sources,
  isLoading,
}: {
  messageId?: string;
  sources: SourceRef[];
  isLoading?: boolean;
}) => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  if (!isLoading && sources.length === 0) {
    return null;
  }

  return (
    <Stack gap="lg" className={S.sources}>
      <Stack gap="sm">
        <Text fz="sm" lh="lg" c="text-secondary">
          {ngettext(
            msgid`Data source used`,
            `Data sources used`,
            sources.length,
          )}
        </Text>
        {isLoading ? (
          <SourceSkeleton />
        ) : (
          <Group gap="xxs" mih="1.5rem">
            {sources.map((source, index) => (
              <Group
                key={`${source.model}-${source.id}`}
                gap="xxxs"
                wrap="nowrap"
              >
                <SourceLink {...source} />
                {index < sources.length - 1 && <Text component="span">,</Text>}
              </Group>
            ))}
            {messageId && sources.length === 1 && (
              <Box ml="xxs">
                <SingleSourceFeedback
                  messageId={messageId}
                  source={sources[0]}
                />
              </Box>
            )}
          </Group>
        )}
      </Stack>
      {messageId && !isLoading && sources.length > 1 && (
        <UnstyledButton
          fz="sm"
          fw="bold"
          c="text-brand"
          w="fit-content"
          onClick={() => setIsFeedbackOpen(true)}
        >
          {t`Give feedback`}
        </UnstyledButton>
      )}
      {messageId && isFeedbackOpen && (
        <SourceFeedbackModal
          messageId={messageId}
          sources={sources}
          onClose={() => setIsFeedbackOpen(false)}
        />
      )}
    </Stack>
  );
};

const MbqlSources = ({
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
  const { data, isLoading, isError } = useGetFieldTableIdsQuery(
    fieldIds.length > 0 ? { field_ids: fieldIds } : skipToken,
  );

  if (isError) {
    return null;
  }

  const allTableIds = uniqueNumbers(tableIds.concat(data?.table_ids ?? []));

  return (
    <SourcesSection
      messageId={messageId}
      sources={toSourceRefs(allTableIds, cardIds)}
      isLoading={isLoading}
    />
  );
};

const NativeSources = ({
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

  return (
    <SourcesSection
      messageId={messageId}
      sources={toSourceRefs(
        (data?.tables ?? []).map((table) => table.id),
        data?.card_ids ?? [],
      )}
      isLoading={isLoading}
    />
  );
};

const DatasetQueryTablePills = ({
  messageId,
  datasetQuery,
}: {
  messageId?: string;
  datasetQuery: DatasetQuery | undefined;
}) => {
  const decoded = useMemo(() => decodeQuery(datasetQuery), [datasetQuery]);

  if (decoded.kind === "none") {
    return null;
  }

  if (decoded.kind === "native") {
    return (
      <NativeSources
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
    <MbqlSources
      tableIds={decoded.tableIds}
      cardIds={decoded.cardIds}
      fieldIds={decoded.fieldIds}
      messageId={messageId}
    />
  );
};

export const GeneratedCardTablePills = ({
  messageId,
  value,
}: {
  messageId?: string;
  value: GeneratedCard;
}) => (
  <DatasetQueryTablePills
    messageId={messageId}
    datasetQuery={value.query.query}
  />
);

export const NavigateToTablePills = ({
  messageId,
  path,
}: {
  messageId?: string;
  path: string;
}) => {
  const datasetQuery = useMemo(() => {
    try {
      return deserializeCardFromQuery(path).dataset_query;
    } catch {
      return undefined;
    }
  }, [path]);

  return (
    <DatasetQueryTablePills messageId={messageId} datasetQuery={datasetQuery} />
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
    <NativeSources
      databaseId={databaseId}
      messageId={messageId}
      sql={value.value}
    />
  );
};
