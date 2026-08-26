import { c, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Card, Group, Icon, Loader, Text, Tooltip } from "metabase/ui";
import { useGetTablePublishingInfoQuery } from "metabase-enterprise/api";
import type { Table, TablePublishingInfo } from "metabase-types/api";

type PublishingInfoProps = {
  table: Pick<Table, "id" | "is_published">;
};

export function PublishingInfo({ table }: PublishingInfoProps) {
  const { data: publishingInfo, isLoading } = useGetTablePublishingInfoQuery(
    table.id,
    {
      skip: !table.is_published,
    },
  );

  if (!table.is_published) {
    return null;
  }

  return (
    <Card.Section withBorder p="md">
      <Group gap="sm" mb={4} wrap="nowrap">
        <Icon name="publish" c="core-brand" />
        {isLoading ? (
          <Loader size="xs" data-testid="table-publishing-info-loading" />
        ) : (
          <PublishingInfoValue publishingInfo={publishingInfo} />
        )}
      </Group>
      <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
        {t`Published`}
      </Text>
    </Card.Section>
  );
}

function PublishingInfoValue({
  publishingInfo,
}: {
  publishingInfo?: TablePublishingInfo;
}) {
  if (publishingInfo?.published_at == null) {
    return (
      <Text size="md" fw={600} lh="1rem">
        {t`Publishing details unavailable`}
      </Text>
    );
  }

  const publishedAt = (
    <Tooltip
      key="published-at"
      label={<DateTime value={publishingInfo.published_at} />}
      offset={8}
    >
      <DateTime
        value={publishingInfo.published_at}
        unit="day"
        data-testid="table-publishing-date"
      />
    </Tooltip>
  );

  return (
    <Text size="md" fw={600} lh="1rem">
      {publishingInfo.published_by == null
        ? publishedAt
        : c(
            "Describes when a table was published. {0} is a date and {1} is a person's name",
          ).jt`${publishedAt} by ${publishingInfo.published_by.common_name}`}
    </Text>
  );
}
