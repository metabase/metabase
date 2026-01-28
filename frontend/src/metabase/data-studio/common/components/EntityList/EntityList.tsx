import type { ReactNode } from "react";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import type { IconName } from "metabase/ui";
import { Button, Group, Icon, Stack, Title } from "metabase/ui";

type EntityListEmptyState = {
  icon: IconName;
  title: string;
  message: string;
};

type EntityListProps<T> = {
  items: T[];
  title: string;
  emptyState: EntityListEmptyState;
  newButtonLabel?: string;
  newButtonUrl?: string;
  renderItem: (item: T) => ReactNode;
};

export function EntityList<T>({
  items,
  title,
  emptyState,
  newButtonLabel,
  newButtonUrl,
  renderItem,
}: EntityListProps<T>) {
  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>{title}</Title>
        {newButtonLabel && newButtonUrl && (
          <Button component={ForwardRefLink} to={newButtonUrl} variant="filled">
            {newButtonLabel}
          </Button>
        )}
      </Group>

      {items.length === 0 ? (
        <EmptyState
          illustrationElement={
            <Icon name={emptyState.icon} size={32} c="text-secondary" />
          }
          title={emptyState.title}
          message={emptyState.message}
        />
      ) : (
        <Stack gap="sm" role="list">
          {items.map((item, index) => (
            <div key={index}>{renderItem(item)}</div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
