import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  ScrollArea,
  Stack,
  TextInput,
  Title,
} from "metabase/ui";
import type { DimensionId, MetricDimension } from "metabase-types/api";

import { DimensionRow } from "./DimensionRow";
import S from "./MetricDimensions.module.css";

interface DimensionListProps {
  dimensions: MetricDimension[];
  isLoading: boolean;
  error: unknown;
  search: string;
  checkedIds: Set<DimensionId>;
  activeId: DimensionId | null;
  isAddDisabled: boolean;
  onSearchChange: (value: string) => void;
  onToggle: (id: DimensionId, checked: boolean) => void;
  onAdd: () => void;
  onRemove: () => void;
  onEdit: (id: DimensionId) => void;
}

export function DimensionList({
  dimensions,
  isLoading,
  error,
  search,
  checkedIds,
  activeId,
  isAddDisabled,
  onSearchChange,
  onToggle,
  onAdd,
  onRemove,
  onEdit,
}: DimensionListProps) {
  const hasChecked = checkedIds.size > 0;

  return (
    <Stack gap="md" className={S.column} data-testid="metric-dimension-list">
      <Group justify="space-between" wrap="nowrap" align="center">
        <Title order={4}>{t`Add, remove, edit, or reorder dimensions`}</Title>
        <Group gap="sm" wrap="nowrap">
          {hasChecked && (
            <ActionIcon
              aria-label={t`Remove`}
              variant="subtle"
              onClick={onRemove}
            >
              <Icon name="trash" />
            </ActionIcon>
          )}
          <Button
            variant="filled"
            disabled={isAddDisabled}
            onClick={onAdd}
          >{t`Add`}</Button>
        </Group>
      </Group>

      <TextInput
        placeholder={t`Search…`}
        value={search}
        leftSection={<Icon name="search" />}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />

      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <ScrollArea className={S.scrollArea}>
          <Stack gap="sm">
            {dimensions.map((dimension) => (
              <DimensionRow
                key={dimension.id}
                dimension={dimension}
                checked={checkedIds.has(dimension.id)}
                active={dimension.id === activeId}
                onToggle={(checked) => onToggle(dimension.id, checked)}
                onEdit={() => onEdit(dimension.id)}
              />
            ))}
          </Stack>
        </ScrollArea>
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
