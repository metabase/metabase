import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Flex, Icon, Loader, Select, Tabs, TextInput } from "metabase/ui";
import type * as Urls from "metabase/urls";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
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
  const [search, setSearch] = useState(params.search ?? "");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const paramsRef = useLatest(params);
  const onChangeRef = useLatest(onChange);
  const lastPushedSearch = useRef(params.search ?? "");

  useEffect(() => {
    if (debouncedSearch !== lastPushedSearch.current) {
      lastPushedSearch.current = debouncedSearch;
      onChangeRef.current({
        ...paramsRef.current,
        search: debouncedSearch || undefined,
        candidateId: undefined,
      });
    }
  }, [debouncedSearch, onChangeRef, paramsRef]);

  // Adjusted during render, not via an effect keyed on params.search: this only
  // needs to resync `search` when the URL changes from outside this component
  // (e.g. the back button), and doing it here shows the synced value in the
  // same render instead of one render late.
  const urlSearch = params.search ?? "";
  if (urlSearch !== lastPushedSearch.current) {
    lastPushedSearch.current = urlSearch;
    if (search !== urlSearch) {
      setSearch(urlSearch);
    }
  }

  const update = (values: Partial<Urls.DataStudioCleanupParams>) =>
    onChange({ ...params, ...values, candidateId: undefined });

  return (
    <Flex gap="sm" wrap="wrap">
      <TextInput
        aria-label={t`Search cleanup candidates`}
        placeholder={searchPlaceholder}
        leftSection={<Icon name="search" />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        rightSection={search !== debouncedSearch ? <Loader size="xs" /> : null}
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

const QUEUES: UsageMetadataCleanupQueue[] = [
  "suggested",
  "used-raw",
  "discarded",
];

export function CleanupQueueTabs({
  params,
  onChange,
  variant,
}: Pick<CleanupFiltersProps, "params" | "onChange"> & {
  variant?: "default" | "pills";
}) {
  const queue = params.queue ?? "suggested";

  return (
    <Tabs
      variant={variant}
      value={queue}
      onChange={(value) =>
        onChange({
          ...params,
          queue: isCleanupQueue(value) ? value : "suggested",
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
    case "used-raw":
      return t`Used raw`;
    case "discarded":
      return t`Discarded`;
  }
}
