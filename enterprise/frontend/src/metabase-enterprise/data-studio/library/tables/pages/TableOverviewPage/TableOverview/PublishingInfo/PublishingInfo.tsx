import { c, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Card, Group, Icon, Text, Tooltip } from "metabase/ui";
import { useGetTablePublishingInfoQuery } from "metabase-enterprise/api";
import type { Table, TablePublishingInfo } from "metabase-types/api";

type PublishingInfoProps = {
  table: Pick<Table, "id" | "is_published">;
};

export function PublishingInfo({ table }: PublishingInfoProps) {
  const { data: publishingInfo } = useGetTablePublishingInfoQuery(table.id, {
    skip: !table.is_published,
  });

  if (!table.is_published || publishingInfo == null) {
    return null;
  }

  // This component must be rendered inside a Card parent.
  return (
    <Card.Section withBorder p="md">
      <Group gap="sm" mb={4} wrap="nowrap">
        <Icon name="publish" c="core-brand" />
        <PublishingInfoValue
          publishedAt={publishingInfo.published_at}
          publishedBy={publishingInfo.published_by}
        />
      </Group>
      <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
        {t`Published`}
      </Text>
    </Card.Section>
  );
}

function PublishingInfoValue({
  publishedAt,
  publishedBy,
}: {
  publishedAt: string;
  publishedBy: TablePublishingInfo["published_by"];
}) {
  const publishedAtElement = (
    <Tooltip
      key="published-at"
      label={<DateTime value={publishedAt} />}
      offset={8}
    >
      <DateTime
        value={publishedAt}
        unit="day"
        data-testid="table-publishing-date"
      />
    </Tooltip>
  );

  return (
    <Text size="md" fw={600} lh="1rem">
      {publishedBy == null
        ? publishedAtElement
        : c(
            "Describes when a table was published. {0} is a date and {1} is a person's name",
          ).jt`${publishedAtElement} by ${publishedBy.common_name}`}
    </Text>
  );
}
