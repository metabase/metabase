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
import { Stack, Text, Tooltip } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { Card as CardApiType, CardType } from "metabase-types/api";

import type { MetricUrls } from "../../../../types";

import { MetadataLinkCard, type MetadataRow } from "./MetadataLinkCard";
import { MetricSubSection } from "./MetricSubSection";

interface DescriptionSectionProps {
  card: CardApiType;
  urls: MetricUrls;
}

export function DescriptionSection({ card, urls }: DescriptionSectionProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const canSeeRelationships = useSelector(
    (state) => getUserIsAdmin(state) || getUserIsAnalyst(state),
  );

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

  const sourceRows: MetadataRow[] = [];
  if (database) {
    sourceRows.push({
      icon: "database",
      content: database.name,
      to: urls.database?.(database.id),
    });
  }
  if (table && card.database_id != null) {
    sourceRows.push({
      icon: "table",
      content: table.display_name || table.name,
      to: urls.table?.(card.database_id, table.id),
    });
  }

  const dependenciesUrl = urls.dependencies(card.id);

  const relationshipRows: MetadataRow[] = canSeeRelationships
    ? [
        dependenciesCount > 0
          ? {
              icon: "link",
              content: ngettext(
                msgid`${dependenciesCount} dependency`,
                `${dependenciesCount} dependencies`,
                dependenciesCount,
              ),
              to: dependenciesUrl,
            }
          : {
              icon: "link",
              content: t`No dependencies`,
            },
        dependentsCount > 0
          ? {
              icon: "lineandbar",
              content: jt`${(
                <Text key="count" component="span" fw={600} c="brand">
                  {ngettext(
                    msgid`${dependentsCount} chart`,
                    `${dependentsCount} charts`,
                    dependentsCount,
                  )}
                </Text>
              )} ${ngettext(
                msgid`uses this metric`,
                `use this metric`,
                dependentsCount,
              )}`,
              to: dependenciesUrl,
            }
          : {
              icon: "lineandbar",
              content: t`No charts use this metric`,
            },
      ]
    : [];

  return (
    <Stack
      p="md"
      gap="md"
      align="stretch"
      data-testid="metric-description-sidebar"
    >
      <Text fw={600}>{t`About`}</Text>
      <Tooltip label={<DateTime value={card.updated_at} />}>
        <Text size="sm" c="text-secondary" data-testid="metric-last-updated">
          {t`Last updated ${getRelativeTime(card.updated_at)}`}
        </Text>
      </Tooltip>
      <div data-testid="metric-description-section">
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
      </div>
      {sourceRows.length > 0 && (
        <MetricSubSection title={t`Source`}>
          <MetadataLinkCard rows={sourceRows} />
        </MetricSubSection>
      )}
      {canSeeRelationships && (
        <MetricSubSection title={t`Relationships`}>
          <MetadataLinkCard rows={relationshipRows} />
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
