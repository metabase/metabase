import { useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { CardDisplayType, IconName } from "metabase-types/api";

import { BlockFilters } from "./BlockFilters";
import S from "./SummaryCanvas.module.css";
import { DimensionChip, SummaryWell } from "./SummaryWells";
import {
  addValue,
  buildBlockQuery,
  getBlockDisplay,
  getBlockTitle,
  getDimensionLabels,
  removeItem,
  setTemporalUnit,
  updateValue,
} from "./blocks";
import { FormulaBar } from "./formula/FormulaBar";
import type {
  SummaryBase,
  SummaryBlock,
  SummaryDimension,
  SummaryDimensionWellId,
  SummaryDragItem,
} from "./types";

type DisplayOption = { value: CardDisplayType; label: string; icon: IconName };

const getDisplayOptions = (): DisplayOption[] => [
  { value: "table", label: t`Table`, icon: "table2" },
  { value: "pivot", label: t`Pivot table`, icon: "pivot_table" },
  { value: "scalar", label: t`Number`, icon: "number" },
  { value: "bar", label: t`Bar`, icon: "bar" },
  { value: "line", label: t`Line`, icon: "line" },
  { value: "area", label: t`Area`, icon: "area" },
  { value: "row", label: t`Row`, icon: "horizontal_bar" },
  { value: "pie", label: t`Pie`, icon: "pie" },
];

type BlockInspectorProps = {
  base: SummaryBase;
  block: SummaryBlock;
  draggedItem: SummaryDragItem | null;
  /** Receives an update to apply to the latest version of the block. */
  onChange: (updater: (block: SummaryBlock) => SummaryBlock) => void;
  onClose: () => void;
};

/** Edits the selected summary: its values, groupings, filters, title, and visualization. */
export function BlockInspector({
  base,
  block,
  draggedItem,
  onChange,
  onClose,
}: BlockInspectorProps) {
  const [isAddingValue, setIsAddingValue] = useState(false);
  const { query: blockQuery } = buildBlockQuery(base, block);
  const dimensionLabels = getDimensionLabels(base, block, blockQuery);
  const autoTitle = getBlockTitle(base, { ...block, title: null }, blockQuery);

  const renderDimensions = (
    wellId: SummaryDimensionWellId,
    dimensions: SummaryDimension[],
  ) =>
    dimensions.map((dimension) => (
      <DimensionChip
        key={dimension.id}
        base={base}
        wellId={wellId}
        dimension={dimension}
        label={dimensionLabels.get(dimension.id) ?? ""}
        onChangeTemporalUnit={(temporalUnit) =>
          onChange((block) =>
            setTemporalUnit(block, dimension.id, temporalUnit),
          )
        }
        onRemove={() => onChange((block) => removeItem(block, dimension.id))}
      />
    ));

  return (
    <Stack className={S.inspector} gap="lg" data-testid="summary-inspector">
      <Flex align="center" gap="sm">
        <TextInput
          flex={1}
          size="sm"
          value={block.title ?? ""}
          placeholder={autoTitle}
          aria-label={t`Summary title`}
          onChange={(event) => {
            const title = event.currentTarget.value;
            onChange((block) => ({
              ...block,
              title: title.length > 0 ? title : null,
            }));
          }}
        />
        <Tooltip label={t`Done`}>
          <ActionIcon variant="subtle" aria-label={t`Done`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <DisplayPicker
        value={getBlockDisplay(block)}
        isAuto={block.display == null}
        onChange={(display) => onChange((block) => ({ ...block, display }))}
        onReset={() => onChange((block) => ({ ...block, display: null }))}
      />

      <SummaryWell
        wellId="values"
        title={t`Values`}
        hint={t`Formulas over the data`}
        placeholder={t`Drag a column or metric here, or add a calculation`}
        draggedItem={draggedItem}
        isEmpty={block.values.length === 0 && !isAddingValue}
        footer={
          !isAddingValue && (
            <UnstyledButton
              className={S.addValue}
              onClick={() => setIsAddingValue(true)}
            >
              <Group gap="xs" wrap="nowrap">
                <Icon name="add" size={12} aria-hidden />
                <Text c="inherit" size="sm">{t`Add calculation`}</Text>
              </Group>
            </UnstyledButton>
          )
        }
      >
        {block.values.map((value) => (
          <FormulaBar
            key={value.id}
            query={base.query}
            source={value.source}
            onCommit={(source) =>
              onChange((block) => updateValue(block, value.id, source))
            }
            onRemove={() => onChange((block) => removeItem(block, value.id))}
          />
        ))}
        {isAddingValue && (
          <FormulaBar
            query={base.query}
            source=""
            autoFocus
            onCommit={(source) => {
              setIsAddingValue(false);
              onChange((block) => addValue(block, source));
            }}
            onRemove={() => setIsAddingValue(false)}
          />
        )}
      </SummaryWell>

      <SummaryWell
        wellId="rows"
        title={t`Rows`}
        hint={t`Group by`}
        placeholder={t`Drag columns here to group rows`}
        draggedItem={draggedItem}
        isEmpty={block.rows.length === 0}
      >
        {renderDimensions("rows", block.rows)}
      </SummaryWell>

      <SummaryWell
        wellId="columns"
        title={t`Columns`}
        hint={t`Split across the top, or into series`}
        placeholder={t`Drag columns here to split across the top`}
        draggedItem={draggedItem}
        isEmpty={block.columns.length === 0}
      >
        {renderDimensions("columns", block.columns)}
      </SummaryWell>

      <Box>
        <Group gap="xs" mb="xs" align="baseline">
          <Text fw="bold">{t`Filters`}</Text>
          <Text size="sm" c="text-secondary">
            {t`Only this summary`}
          </Text>
        </Group>
        <BlockFilters
          base={base}
          block={block}
          onChange={(filters) => onChange((block) => ({ ...block, filters }))}
        />
      </Box>
    </Stack>
  );
}

type DisplayPickerProps = {
  value: CardDisplayType;
  isAuto: boolean;
  onChange: (display: CardDisplayType) => void;
  onReset: () => void;
};

function DisplayPicker({
  value,
  isAuto,
  onChange,
  onReset,
}: DisplayPickerProps) {
  return (
    <Box>
      <Group gap="xs" mb="xs" justify="space-between">
        <Text fw="bold">{t`Show as`}</Text>
        {!isAuto && (
          <UnstyledButton onClick={onReset}>
            <Text size="sm" c="text-brand">{t`Pick automatically`}</Text>
          </UnstyledButton>
        )}
      </Group>
      <Flex className={S.displayPicker} gap="xxs" p="xxs" wrap="wrap">
        {getDisplayOptions().map((option) => {
          const isSelected = option.value === value;
          return (
            <Tooltip key={option.value} label={option.label}>
              <ActionIcon
                w="2rem"
                h="1.75rem"
                variant={isSelected ? "filled" : "subtle"}
                bg={isSelected ? "background_page-primary" : undefined}
                className={isSelected ? S.displaySelected : undefined}
                aria-label={option.label}
                aria-pressed={isSelected}
                onClick={() => onChange(option.value)}
              >
                <Icon
                  name={option.icon}
                  c={isSelected ? "core-brand" : "text-primary"}
                />
              </ActionIcon>
            </Tooltip>
          );
        })}
      </Flex>
    </Box>
  );
}
