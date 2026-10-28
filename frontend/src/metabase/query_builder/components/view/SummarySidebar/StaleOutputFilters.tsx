import { t } from "ttag";

import { ActionIcon, Flex, Icon, Stack, Text } from "metabase/ui";

import type { StaleOutputFilter, SummaryOutputFilter } from "./summary-session";

type StaleOutputFiltersProps = {
  staleFilters: readonly StaleOutputFilter[];
  onRemove: (filter: SummaryOutputFilter) => void;
};

/**
 * The summary's output filters that are off because the summary lost a column they read. Each
 * applies again once the summary outputs that column again, or can be removed.
 */
export function StaleOutputFilters({
  staleFilters,
  onRemove,
}: StaleOutputFiltersProps) {
  if (staleFilters.length === 0) {
    return null;
  }
  return (
    <Stack
      gap="xs"
      p="sm"
      style={{ flexShrink: 0 }}
      data-testid="stale-output-filters"
    >
      {staleFilters.map(({ filter, missingColumnNames }, index) => (
        <Flex
          key={`${index}-${filter.displayName}`}
          gap="sm"
          align="flex-start"
          p="sm"
          bg="background_surface-warning"
          bdrs="sm"
        >
          <Icon name="warning" c="text-secondary" mt={2} />
          <Text size="sm" flex={1}>
            {t`${filter.displayName} is off: the summary no longer has ${missingColumnNames.join(", ")}. Add it back to apply the filter again.`}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t`Remove filter ${filter.displayName}`}
            onClick={() => onRemove(filter)}
          >
            <Icon name="close" />
          </ActionIcon>
        </Flex>
      ))}
    </Stack>
  );
}
