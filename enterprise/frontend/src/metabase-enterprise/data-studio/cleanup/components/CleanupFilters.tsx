import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Flex, Icon, Select, Tabs, TextInput } from "metabase/ui";
import type * as Urls from "metabase/urls";
import type { UsageMetadataCleanupQueue } from "metabase-types/api";

type CleanupFiltersProps = {
  params: Urls.DataStudioCleanupParams;
  onChange: (params: Urls.DataStudioCleanupParams) => void;
  showDatabaseFilter?: boolean;
  searchPlaceholder?: string;
};

export function CleanupFilters({
  params,
  onChange,
  showDatabaseFilter = true,
  searchPlaceholder = t`Search suggestions`,
}: CleanupFiltersProps) {
  const { data: databaseResponse } = useListDatabasesQuery();

  const update = (values: Partial<Urls.DataStudioCleanupParams>) =>
    onChange({ ...params, ...values, page: undefined, candidateId: undefined });

  return (
    <Flex gap="sm" wrap="wrap">
      <TextInput
        aria-label={t`Search cleanup candidates`}
        placeholder={searchPlaceholder}
        leftSection={<Icon name="search" />}
        value={params.search ?? ""}
        onChange={(event) =>
          update({ search: event.currentTarget.value || undefined })
        }
        miw="16rem"
        flex={1}
      />
      {showDatabaseFilter && (
        <Select
          aria-label={t`Database`}
          placeholder={t`All databases`}
          clearable
          searchable
          value={params.databaseId != null ? String(params.databaseId) : null}
          data={
            databaseResponse?.data.map((database) => ({
              value: String(database.id),
              label: database.name,
            })) ?? []
          }
          onChange={(value) =>
            update({
              databaseId: value ? Number(value) : undefined,
            })
          }
        />
      )}
    </Flex>
  );
}

const QUEUES: UsageMetadataCleanupQueue[] = ["suggested", "discarded"];

export function CleanupQueueTabs({
  params,
  onChange,
}: Pick<CleanupFiltersProps, "params" | "onChange">) {
  const queue = params.queue ?? "suggested";

  return (
    <Tabs
      value={queue}
      onChange={(value) =>
        onChange({
          ...params,
          queue: isCleanupQueue(value) ? value : "suggested",
          page: undefined,
          candidateId: undefined,
        })
      }
    >
      <Tabs.List>
        {QUEUES.map((value) => (
          <Tabs.Tab key={value} value={value}>
            {getQueueLabel(value)}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function isCleanupQueue(
  value: string | null,
): value is UsageMetadataCleanupQueue {
  return QUEUES.some((queue) => queue === value);
}

function getQueueLabel(queue: UsageMetadataCleanupQueue) {
  switch (queue) {
    case "suggested":
      return t`Suggested`;
    case "discarded":
      return t`Discarded`;
  }
}
