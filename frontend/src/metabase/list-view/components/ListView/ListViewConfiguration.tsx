import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import cx from "classnames";
import { defaults } from "underscore";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ReorderableTagsInput,
  SortablePill,
} from "metabase/common/components/ReorderableTagsInput/ReorderableTagsInput";
import { getColumnExample } from "metabase/query_builder/components/expressions/CombineColumns/util";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  type IconName,
  Image,
  Menu,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData, RowValues } from "metabase-types/api";

import { useListColumns } from "./ListView";
import S from "./ListView.module.css";
import { ListViewItem } from "./ListViewItem";
import {
  ENTITY_ICONS,
  ENTITY_ICON_COLORS,
  getEntityIcon,
  getIconBackground,
} from "./styling";

const MAX_LEFT_COLUMNS = 1;
const MAX_RIGHT_COLUMNS = 5;
type ContainerId = "left" | "right";

export const ListViewConfiguration = ({
  data,
  onChange,
  settings,
  columnsMetadata,
  entityType,
}: {
  data: DatasetData;
  onChange: (settings: {
    left: string[];
    right: string[];
    entityIcon?: string | null;
    entityIconColor?: string;
    entityIconEnabled?: boolean;
    useImageColumn?: boolean;
  }) => void;
  settings?: ComputedVisualizationSettings;
  columnsMetadata: Lib.ColumnMetadata[];
  entityType?: string;
}) => {
  const { cols, rows } = data;

  // Use the same default inference as the list view
  const { imageColumn, titleColumn, rightColumns } = useListColumns(
    cols,
    settings?.["list.columns"],
  );

  // Selected values
  const [leftValues, setLeftValues] = useState(() => [
    ...(titleColumn ? [titleColumn.name] : []),
  ]);
  useEffect(() => {
    setLeftValues([...(titleColumn ? [titleColumn.name] : [])]);
  }, [titleColumn]);
  const [rightValues, setRightValues] = useState(() =>
    rightColumns.map((col) => col?.name).filter(Boolean),
  );
  useEffect(() => {
    setRightValues(rightColumns.map((col) => col?.name).filter(Boolean));
  }, [rightColumns]);

  // Local state duplication for selected settings to immediately reflect
  // list item preview changes.

  const [iconConfig, setIconConfig] = useState<{
    selectedEntityIcon: IconName | null;
    selectedIconColor?: string;
    entityIconEnabled: boolean;
    useImageColumn: boolean;
  }>(() => ({
    selectedEntityIcon: settings?.["list.use_image_column"]
      ? null
      : settings?.["list.entity_icon"] || getEntityIcon(entityType),
    selectedIconColor: settings?.["list.entity_icon_color"],
    entityIconEnabled: settings?.["list.entity_icon_enabled"] ?? false,
    useImageColumn: settings?.["list.use_image_column"] ?? false,
  }));

  // Exclude options already used by any of the two selects, but keep the ones
  // selected in the respective select so tags render properly
  const allOptions = cols.map((col) => ({
    value: col.name,
    label: col.display_name,
  }));
  const used = new Set([...leftValues, ...rightValues]);
  const leftOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || leftValues.includes(opt.value),
  );
  const rightOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || rightValues.includes(opt.value),
  );

  const previewSample = useMemo(
    () => generatePreviewSample(data.rows, columnsMetadata),
    [data.rows, columnsMetadata],
  );

  const findColByName = (name?: string): DatasetColumn | undefined =>
    cols.find((c) => c.name === name);
  const selectedTitleColumn = findColByName(leftValues[0]);
  const selectedRightColumns = rightValues
    .slice(0, 5)
    .map(findColByName)
    .filter(Boolean);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleConfigurationChange = ({
    left = leftValues,
    right = rightValues,
    entityIcon,
    entityIconColor,
    entityIconEnabled,
    useImageColumn,
  }: {
    left?: string[];
    right?: string[];
    entityIcon?: IconName | null;
    entityIconColor?: string;
    entityIconEnabled?: boolean;
    useImageColumn?: boolean;
  }) => {
    if (left !== undefined) {
      setLeftValues(left);
    }
    if (right !== undefined) {
      setRightValues(right);
    }

    const hasIconConfigChange =
      entityIcon !== undefined ||
      entityIconColor !== undefined ||
      entityIconEnabled !== undefined ||
      useImageColumn !== undefined;
    if (hasIconConfigChange) {
      setIconConfig((prev) =>
        defaults(
          {
            selectedEntityIcon: entityIcon,
            selectedIconColor: entityIconColor,
            entityIconEnabled,
            useImageColumn,
          },
          prev,
        ),
      );
    }
    onChange({
      left,
      right,
      entityIcon,
      entityIconColor,
      entityIconEnabled,
      useImageColumn,
    });
  };

  const {
    activeId,
    currentDroppable,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useExternalDragOverlay({
    leftValues,
    rightValues,
    onConfigurationChange: handleConfigurationChange,
  });

  const activeItem = activeId
    ? {
        id: activeId,
        label:
          allOptions.find((opt) => opt.value === activeId)?.label ?? activeId,
      }
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Stack
        h="100%"
        p="2rem"
        align="center"
        className={S.listViewContainer}
        style={{ "--grid-columns": Math.max(rightValues.length, 1) }}
      >
        <Stack justify="center" flex={1} maw="var(--max-width)" w="100%">
          <Text fw="bold">{t`Customize List columns`}</Text>
          <Box className={S.listViewConfigurationInputs}>
            {/* Icon selector */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Flex
                  bg="var(--mb-color-background-hover-light)"
                  w="3rem"
                  h="3rem"
                  justify="center"
                  align="center"
                  style={{
                    border: "1px dashed var(--mb-color-saturated-blue)",
                    borderRadius: "50%",
                    overflow: "hidden",
                    padding: "0.5rem",
                  }}
                >
                  <ActionIcon
                    data-testid="list-view-icon"
                    variant="subtle"
                    p={0}
                    w="100%"
                    h="100%"
                    style={{
                      display: "flex",
                      borderRadius: "50%",
                      border: "1px solid var(--mb-color-border)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      backgroundColor: iconConfig.entityIconEnabled
                        ? getIconBackground(iconConfig.selectedIconColor)
                        : "var(--mb-color-white)",
                    }}
                  >
                    {iconConfig.useImageColumn &&
                    iconConfig.entityIconEnabled &&
                    imageColumn ? (
                      <Image
                        src={previewSample[cols.indexOf(imageColumn)]}
                        alt=""
                        w={32}
                        h={32}
                        radius="xl"
                        style={{ flexShrink: 0 }}
                      />
                    ) : (
                      <Icon
                        tooltip="Entity icon"
                        name={
                          iconConfig.entityIconEnabled &&
                          iconConfig.selectedEntityIcon
                            ? iconConfig.selectedEntityIcon
                            : "ban"
                        }
                        size="1rem"
                        className={S.listEntityIcon}
                        c={
                          iconConfig.entityIconEnabled
                            ? iconConfig.selectedIconColor
                            : "text-light"
                        }
                      />
                    )}
                  </ActionIcon>
                </Flex>
              </Menu.Target>

              <Menu.Dropdown
                p={0}
                w="16rem"
                style={{ borderRadius: "var(--mantine-radius-lg)" }}
              >
                <Box p="md">
                  <Switch
                    label={t`Show image`}
                    size="sm"
                    labelPosition="left"
                    w="100%"
                    styles={{
                      labelWrapper: { marginRight: "auto" },
                    }}
                    checked={iconConfig.entityIconEnabled}
                    onChange={(e) => {
                      handleConfigurationChange({
                        left: leftValues,
                        right: rightValues,
                        entityIconEnabled: e.currentTarget.checked,
                      });
                    }}
                  />
                </Box>
                <Menu.Divider m={0} />
                <SimpleGrid cols={5} p="md">
                  <ActionIcon
                    radius="lg"
                    p="md"
                    w="2rem"
                    h="2rem"
                    disabled={!imageColumn}
                    className={cx({
                      [S.imageColumn]: !!imageColumn,
                      [S.selected]:
                        iconConfig.useImageColumn &&
                        iconConfig.entityIconEnabled,
                    })}
                    onClick={() => {
                      handleConfigurationChange({
                        left: leftValues,
                        right: rightValues,
                        useImageColumn: true,
                        entityIcon: null,
                      });
                    }}
                  >
                    {imageColumn ? (
                      <Image
                        src={previewSample[cols.indexOf(imageColumn)]}
                        alt=""
                        w={32}
                        h={32}
                        style={{ flexShrink: 0 }}
                      />
                    ) : (
                      <Flex justify="center" align="center">
                        <Icon
                          tooltip={t`Image field not found`}
                          tooltipPosition="right"
                          name="camera"
                          size={16}
                          c="text-primary"
                        />
                      </Flex>
                    )}
                  </ActionIcon>
                  {Object.entries(ENTITY_ICONS).map(([key, iconName]) => (
                    <Flex justify="center" align="center" key={key}>
                      <ActionIcon
                        w="2rem"
                        h="2rem"
                        radius="lg"
                        className={cx({
                          [S.selected]:
                            iconConfig.selectedEntityIcon === iconName &&
                            iconConfig.entityIconEnabled,
                        })}
                        onClick={() => {
                          handleConfigurationChange({
                            left: leftValues,
                            right: rightValues,
                            entityIcon: iconName,
                            useImageColumn: false,
                          });
                        }}
                      >
                        <Icon name={iconName} size={16} c="text-primary" />
                      </ActionIcon>
                    </Flex>
                  ))}
                </SimpleGrid>
                <Menu.Divider m={0} />
                <SimpleGrid cols={6} p="md" data-testid="list-view-icon-colors">
                  {ENTITY_ICON_COLORS.map((color: string) => (
                    <Flex justify="center" align="center" key={color}>
                      <Button
                        className={cx(S.iconColorButton, {
                          [S.selected]: color === iconConfig.selectedIconColor,
                        })}
                        variant="subtle"
                        bg={color}
                        onClick={() => {
                          handleConfigurationChange({
                            entityIconColor: color,
                          });
                        }}
                      />
                    </Flex>
                  ))}
                </SimpleGrid>
              </Menu.Dropdown>
            </Menu>

            {/* Title */}
            <ReorderableTagsInput
              size="lg"
              miw="10rem"
              maw="33%"
              data={leftOptions}
              value={leftValues}
              onChange={(value) =>
                handleConfigurationChange({ left: value, right: rightValues })
              }
              maxValues={MAX_LEFT_COLUMNS}
              placeholder={leftValues.length > 0 ? "" : t`Title`}
              data-testid="list-view-left-columns"
              containerId="left"
              useExternalDnd
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
              styles={{
                input: { paddingBlock: "0.5rem" },
              }}
            />

            {/* Right columns */}
            <ReorderableTagsInput
              size="lg"
              data={rightOptions}
              value={rightValues}
              onChange={(value) =>
                handleConfigurationChange({ left: leftValues, right: value })
              }
              maxValues={MAX_RIGHT_COLUMNS}
              placeholder={
                rightValues.length === MAX_RIGHT_COLUMNS ? "" : t`Right columns`
              }
              data-testid="list-view-right-columns"
              containerId="right"
              useExternalDnd
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
              styles={{ input: { paddingBlock: "0.5rem" } }}
            />
          </Box>
        </Stack>
        <Divider w="100%" />
        <Stack
          w="100%"
          maw="var(--max-width)"
          flex={1}
          justify="center"
          className={S.listContainer}
          data-testid="list-view-preview"
        >
          <Text fw="bold">{t`Preview`}</Text>
          <ListViewItem
            cols={cols}
            rows={rows}
            row={previewSample}
            settings={settings as ComputedVisualizationSettings}
            entityIcon={
              iconConfig.entityIconEnabled && iconConfig.selectedEntityIcon
                ? iconConfig.selectedEntityIcon
                : undefined
            }
            entityIconColor={iconConfig.selectedIconColor}
            imageColumn={
              iconConfig.entityIconEnabled && iconConfig.useImageColumn
                ? imageColumn
                : undefined
            }
            titleColumn={selectedTitleColumn}
            rightColumns={selectedRightColumns}
            onClick={() => {}}
            style={{ cursor: "default" }}
          />
        </Stack>
      </Stack>

      <DragOverlay modifiers={[snapCenterToCursor]}>
        {activeItem ? (
          <SortablePill id={activeItem.id} label={activeItem.label} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

function generatePreviewSample(rows: RowValues[], cols: Lib.ColumnMetadata[]) {
  const sample = rows[0] || Array(cols.length).fill(null);

  return sample.map((value, index) =>
    value == null ? getColumnExample(cols[index]) : value,
  );
}

function useExternalDragOverlay({
  leftValues,
  rightValues,
  onConfigurationChange,
}: {
  leftValues: string[];
  rightValues: string[];
  onConfigurationChange: (values: {
    left: string[];
    right: string[];
    entityIcon?: IconName | null;
  }) => void;
}) {
  // Active drag state for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentDroppable, setCurrentDroppable] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const containerId = over?.data?.current?.containerId;
    if (!containerId) {
      return;
    }
    // Storing the id of container under dragged element
    // to hide it in original container when dragging between the two.
    setCurrentDroppable(containerId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setCurrentDroppable(null);
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const from = active.data?.current?.containerId as ContainerId | undefined;

    if (!from) {
      return;
    }

    // Determine target container - could be from over item's containerId or over.id itself
    let to: ContainerId | undefined;
    let overIndexInTo = -1;

    // Check if we're dropping on an item (has containerId)
    if (over.data?.current?.containerId) {
      to = over.data.current.containerId as ContainerId;
      const toList = to === "left" ? leftValues : rightValues;
      overIndexInTo = toList.indexOf(String(over.id));
    }
    // Check if we're dropping on a container itself (droppable area)
    else if (over.id === "left" || over.id === "right") {
      to = over.id as ContainerId;
      overIndexInTo = -1; // Append to end when dropping on container
    }

    if (!to) {
      return;
    }

    const fromList = from === "left" ? leftValues : rightValues;

    const fromIndex = fromList.indexOf(activeId);
    if (fromIndex === -1) {
      return;
    }

    // Same container: reorder
    if (from === to) {
      if (overIndexInTo === -1 || fromIndex === overIndexInTo) {
        return;
      }
      const next = arrayMove(fromList, fromIndex, overIndexInTo);
      if (from === "left") {
        onConfigurationChange({
          left: next,
          right: rightValues,
        });
      } else {
        onConfigurationChange({
          left: leftValues,
          right: next,
        });
      }
      return;
    }

    // Moving items between containers
    const maxForTo = to === "left" ? MAX_LEFT_COLUMNS : MAX_RIGHT_COLUMNS;
    const toCurrent = to === "left" ? leftValues : rightValues;
    if (toCurrent.length >= maxForTo) {
      return;
    }

    const nextFrom = fromList.slice() as string[];
    nextFrom.splice(fromIndex, 1);

    const nextTo = toCurrent.slice() as string[];
    const insertIndex = overIndexInTo === -1 ? nextTo.length : overIndexInTo;
    nextTo.splice(insertIndex, 0, activeId);

    if (to === "left") {
      onConfigurationChange({
        left: nextTo,
        right: nextFrom,
      });
    } else {
      onConfigurationChange({
        left: nextFrom,
        right: nextTo,
      });
    }
  };

  return {
    activeId,
    currentDroppable,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
