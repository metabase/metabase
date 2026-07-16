import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type DragEndEvent,
  SortableList,
} from "metabase/common/components/Sortable";
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
  onReorder: (ids: DimensionId[]) => void;
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
  onReorder,
}: DimensionListProps) {
  const hasChecked = checkedIds.size > 0;
  // Reordering a search-filtered subset is ambiguous, so dragging is
  // only available on the full list.
  const canReorder = search === "" && dimensions.length > 1;

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const handleSortEnd = ({ itemIds }: DragEndEvent) => {
    onReorder(itemIds.map(String));
  };

  return (
    <Stack
      className={S.column}
      data-testid="metric-dimension-list"
      gap="md"
      pt="lg"
    >
      <Group justify="space-between" wrap="nowrap" align="center">
        <Title order={4}>{t`Dimensions of this metric`}</Title>
        <Group gap="md" wrap="nowrap" align="center">
          {hasChecked && (
            <ActionIcon
              className={S.deleteIconButton}
              aria-label={t`Remove`}
              onClick={onRemove}
              variant="viewHeader"
            >
              <Icon name="trash" />
            </ActionIcon>
          )}
          <Button
            disabled={isAddDisabled}
            onClick={onAdd}
            size="sm"
          >{t`Available dimensions`}</Button>
        </Group>
      </Group>

      <TextInput
        classNames={{ input: S.searchInput }}
        leftSection={<Icon name="search" />}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
        placeholder={t`Search…`}
        value={search}
      />

      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <ScrollArea className={S.scrollArea} offsetScrollbars="present">
          <Stack gap="sm">
            <SortableList
              items={dimensions}
              getId={(dimension) => dimension.id}
              sensors={[pointerSensor]}
              onSortEnd={handleSortEnd}
              renderItem={({ item: dimension }) => (
                <DimensionRow
                  key={dimension.id}
                  dimension={dimension}
                  checked={checkedIds.has(dimension.id)}
                  active={dimension.id === activeId}
                  canReorder={canReorder}
                  onToggle={(checked) => onToggle(dimension.id, checked)}
                  onEdit={() => onEdit(dimension.id)}
                />
              )}
            />
          </Stack>
        </ScrollArea>
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
