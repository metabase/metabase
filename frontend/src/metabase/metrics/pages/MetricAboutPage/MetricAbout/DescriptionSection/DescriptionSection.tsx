import { jt, msgid, ngettext, t } from "ttag";

import {
  useGetDatabaseQuery,
  useGetTableQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { Markdown } from "metabase/common/components/Markdown";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/selectors/user";
import { Box, Stack, Text, Tooltip, rem } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Card as CardApiType, CardType } from "metabase-types/api";

import type { MetricUrls } from "../../../../types";

import { MetadataCard, MetadataRow } from "./MetadataCard";
import { MetricSubSection } from "./MetricSubSection";

interface DescriptionSectionProps {
  card: CardApiType;
  urls: MetricUrls;
}

export function DescriptionSection({ card, urls }: DescriptionSectionProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const canSeeRelationships =
    useSelector((state) => getUserIsAdmin(state) || getUserIsAnalyst(state)) &&
    PLUGIN_DEPENDENCIES.isEnabled;

  const { data: database } = useGetDatabaseQuery(
    { id: card.database_id! },
    { skip: !card.database_id },
  );

  const { data: table } = useGetTableQuery(
    { id: card.table_id! },
    { skip: !card.table_id },
  );

  const { dependentsCount, dependenciesCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(card.id),
      type: "card",
    });

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateCard({
      id: card.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(getErrorMessage(card.type));
    } else {
      sendSuccessToast(getSuccessMessage(card.type));
    }
  };

  const hasSource = Boolean(database || table);
  const dependenciesUrl = urls.dependencies(card.id);

  return (
    <Stack
      p="md"
      gap={0}
      align="stretch"
      data-testid="metric-description-sidebar"
    >
      <Text fz="lg" fw={700}>{t`About`}</Text>
      <Tooltip label={<DateTime value={card.updated_at} />}>
        <Text size="sm" c="text-secondary" data-testid="metric-last-updated">
          {t`Last updated ${getRelativeTime(card.updated_at)}`}
        </Text>
      </Tooltip>
      <Box mt={rem(8)} data-testid="metric-description-section">
        {card.can_write ? (
          <EditableText
            initialValue={card.description ?? ""}
            placeholder={t`No description`}
            isMarkdown
            isOptional
            isMultiline
            onChange={handleChange}
            px={0}
          />
        ) : (
          <Markdown>{card.description || t`No description`}</Markdown>
        )}
      </Box>

      {hasSource && (
        <MetricSubSection title={t`Source`} mt={rem(32)}>
          <MetadataCard>
            {database && (
              <MetadataRow icon="database" to={urls.database?.(database.id)}>
                {database.name}
              </MetadataRow>
            )}
            {table && card.database_id != null && (
              <MetadataRow
                icon="table"
                to={urls.table?.(card.database_id, table.id)}
              >
                {table.display_name || table.name}
              </MetadataRow>
            )}
          </MetadataCard>
        </MetricSubSection>
      )}

      {canSeeRelationships && (
        <MetricSubSection title={t`Relationships`} mt={rem(32)}>
          <MetadataCard>
            {dependenciesCount > 0 ? (
              <MetadataRow icon="dependencies" to={dependenciesUrl}>
                {ngettext(
                  msgid`${dependenciesCount} dependency`,
                  `${dependenciesCount} dependencies`,
                  dependenciesCount,
                )}
              </MetadataRow>
            ) : (
              <MetadataRow icon="dependencies">{t`No dependencies`}</MetadataRow>
            )}
            {dependentsCount > 0 ? (
              <MetadataRow icon="dependencies" to={dependenciesUrl}>
                <Text component="span" c="text-primary" fw={400}>
                  {jt`${(
                    <Text key="count" component="span" fw={600} c="brand">
                      {ngettext(
                        msgid`${dependentsCount} chart`,
                        `${dependentsCount} charts`,
                        dependentsCount,
                      )}
                    </Text>
                  )} ${ngettext(msgid`uses`, `use`, dependentsCount)} this metric`}
                </Text>
              </MetadataRow>
            ) : (
              <MetadataRow icon="dependencies">
                {t`No charts use this metric`}
              </MetadataRow>
            )}
          </MetadataCard>
        </MetricSubSection>
      )}
    </Stack>
  );
}

function getSuccessMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Question description updated`;
    case "model":
      return t`Model description updated`;
    case "metric":
      return t`Metric description updated`;
  }
}

function getErrorMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Failed to update question description`;
    case "model":
      return t`Failed to update model description`;
    case "metric":
      return t`Failed to update metric description`;
  }
}
