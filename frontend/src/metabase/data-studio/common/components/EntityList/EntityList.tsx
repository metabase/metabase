import type { ReactNode } from "react";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Group, Icon, Stack, Title } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type EntityListEmptyState = {
  icon: IconName;
  title: string;
  message: string;
};

type NewButtonProps = {
  label: string;
  trackClickEvent: VoidFunction;
  url: string;
};

type EntityListProps<T> = {
  items: T[];
  title: string;
  emptyState: EntityListEmptyState;
  newButtonProps?: NewButtonProps;
  /** Rendered in the header, before the "new" button. */
  headerActions?: ReactNode;
  renderItem: (item: T) => ReactNode;
};

export function EntityList<T>({
  items,
  title,
  emptyState,
  newButtonProps,
  headerActions,
  renderItem,
}: EntityListProps<T>) {
  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>{title}</Title>
        <Group gap="sm" wrap="nowrap">
          {headerActions}
          {!!newButtonProps && (
            <Button
              component={ForwardRefLink}
              onAuxClick={newButtonProps.trackClickEvent}
              onClickCapture={newButtonProps.trackClickEvent}
              to={newButtonProps.url}
              variant="filled"
            >
              {newButtonProps.label}
            </Button>
          )}
        </Group>
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
