import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useMemo } from "react";

import { Sortable, SortableList } from "metabase/core/components/Sortable";
import type {
  ColumnFormattingSetting,
  DatasetColumn,
} from "metabase-types/api";

import { RulePreview } from "./RulePreview";

type TempId = string | number;
type RuleWithId = ColumnFormattingSetting & { id: TempId };

export interface SortableRuleListProps {
  rules: ColumnFormattingSetting[];
  cols: DatasetColumn[];
  onEdit: (ruleIndex: number) => void;
  onRemove: (ruleIndex: number) => void;
  onMove: (oldIndex: number, newIndex: number) => void;
}

export const SortableRuleList = ({
  rules,
  cols,
  onEdit,
  onRemove,
  onMove,
}: SortableRuleListProps) => {
  const rulesWithIDs: RuleWithId[] = useMemo(
    () => rules.map((rule, index) => ({ ...rule, id: index.toString() })),
    [rules],
  );

  const getId = (rule: RuleWithId) => rule.id.toString();

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortEnd = ({
    id,
    newIndex,
  }: {
    id: TempId;
    newIndex: number;
  }) => {
    const oldIndex = rulesWithIDs.findIndex((rule) => getId(rule) === id);

    onMove(oldIndex, newIndex);
  };

  const handleRemove = (id: TempId) =>
    onRemove(rulesWithIDs.findIndex((rule) => getId(rule) === id));

  const handleEdit = (id: TempId) =>
    onEdit(rulesWithIDs.findIndex((rule) => getId(rule) === id));

  const renderItem = ({ item, id }: { item: RuleWithId; id: TempId }) => (
    <Sortable id={id} draggingStyle={{ opacity: 0.5 }}>
      <RulePreview
        rule={item}
        cols={cols}
        onClick={() => handleEdit(id)}
        onRemove={() => handleRemove(id)}
        my="md"
      />
    </Sortable>
  );

  return (
    <div>
      <SortableList
        items={rulesWithIDs}
        getId={getId}
        renderItem={renderItem}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </div>
  );
};
