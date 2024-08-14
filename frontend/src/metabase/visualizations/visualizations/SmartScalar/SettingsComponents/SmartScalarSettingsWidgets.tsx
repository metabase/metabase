import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback } from "react";
import { usePreviousDistinct } from "react-use";
import { t } from "ttag";

import { Sortable } from "metabase/core/components/Sortable";
import { uuid } from "metabase/lib/uuid";
import { Stack } from "metabase/ui";
import type { DatasetColumn, SmartScalarComparison } from "metabase-types/api";

import { COMPARISON_TYPES } from "../constants";
import type { ComparisonMenuOption } from "../types";

import { ComparisonPicker } from "./ComparisonPicker";
import {
  AddComparisonButton,
  ComparisonList,
} from "./SmartScalarSettingsWidgets.styled";

type SmartScalarComparisonWidgetProps = {
  onChange: (setting: SmartScalarComparison[]) => void;
  options: ComparisonMenuOption[];
  comparableColumns: DatasetColumn[];
  value: SmartScalarComparison[];
  maxComparisons: number;
};

export function SmartScalarComparisonWidget({
  value,
  maxComparisons,
  onChange,
  ...props
}: SmartScalarComparisonWidgetProps) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  });

  const canAddComparison = value.length < maxComparisons;
  const canSortComparisons = value.length > 1;
  const canRemoveComparison = value.length > 1;

  const count = value.length;
  const previousCount = usePreviousDistinct(count) || value.length;
  const hasNewComparison = count - previousCount === 1;

  const handleAddComparison = useCallback(() => {
    const comparison = { id: uuid(), type: COMPARISON_TYPES.PREVIOUS_PERIOD };
    onChange([...value, comparison]);
  }, [value, onChange]);

  const handleChangeComparison = useCallback(
    (comparison: SmartScalarComparison) => {
      const nextValue = value.map(item =>
        item.id === comparison.id ? comparison : item,
      );
      onChange(nextValue);
    },
    [value, onChange],
  );

  const handleRemoveComparison = useCallback(
    (comparison: SmartScalarComparison) => {
      const nextValue = value.filter(item => item.id !== comparison.id);
      onChange(nextValue);
    },
    [value, onChange],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = event.active.id;
      const overId = event.over?.id;
      if (typeof activeId === "string" && typeof overId === "string") {
        const activeIndex = value.findIndex(({ id }) => id === activeId);
        const overIndex = value.findIndex(({ id }) => id === overId);
        const nextValue = arrayMove(value, activeIndex, overIndex);
        onChange(nextValue);
      }
    },
    [value, onChange],
  );

  return (
    <Stack>
      <DndContext
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        sensors={[pointerSensor]}
      >
        <SortableContext
          items={value}
          disabled={!canSortComparisons}
          strategy={verticalListSortingStrategy}
        >
          <ComparisonList data-testid="comparison-list">
            {value.map((comparison, index) => {
              const isLast = index === value.length - 1;
              return (
                <Sortable
                  as="li"
                  key={comparison.id}
                  id={comparison.id}
                  disabled={!canSortComparisons}
                >
                  <ComparisonPicker
                    {...props}
                    value={comparison}
                    isDraggable={canSortComparisons}
                    isInitiallyOpen={hasNewComparison && isLast}
                    isRemovable={canRemoveComparison}
                    onChange={handleChangeComparison}
                    onRemove={() => handleRemoveComparison(comparison)}
                  />
                </Sortable>
              );
            })}
          </ComparisonList>
        </SortableContext>
      </DndContext>
      <AddComparisonButton
        disabled={!canAddComparison}
        onClick={handleAddComparison}
      >{t`Add comparison`}</AddComparisonButton>
    </Stack>
  );
}
