import { useDisclosure } from "@mantine/hooks";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useUnmount } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useLazyGetCardQuery, useLazyGetMeasureQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Menu,
  Text,
  Tooltip,
} from "metabase/ui";
import {
  type GoalRefError,
  resolveGoalValue,
} from "metabase/viz-core";
import type {
  CardId,
  DatasetData,
  DatasetQuery,
  GoalForeignColumnRef,
  GoalForeignEntityRef,
  GoalValue,
  MeasureId,
  ReferencedEntity,
  ReferencedEntityType,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import { GoalColumnMenuItem } from "./GoalColumnMenuItem";
import { GoalEntityPickers } from "./GoalEntityPickers";
import S from "./GoalValueInput.module.css";
import { GoalValuePill } from "./GoalValuePill";
import { StaticGoalValueInput } from "./StaticGoalValueInput";
import { ICON_BUTTON_SIZE } from "./constants";
import type { ColumnOption, PickedItem } from "./types";
import { useEntityColumnValues } from "./use-entity-column-values";
import { useReferencedEntity } from "./use-referenced-entity";
import { useResolvedGoalValue } from "./use-resolved-goal-value";
import { getNumericColumnOptions } from "./utils";

const ROOT_MENU_MIN_WIDTH = 225;
const COLUMN_MENU_MIN_WIDTH = 256;

type MenuLevel = "root" | "self" | "entity";

type PickedEntity = GoalForeignEntityRef & { name: string };

export type GoalValueInputProps = {
  "aria-label"?: string;
  data: DatasetData;
  datasetQuery: DatasetQuery | undefined;
  id: string;
  placeholder?: string;
  referencedEntities: ReferencedEntity[];
  showSelfColumns?: boolean;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
};

export const GoalValueInput = ({
  "aria-label": ariaLabel,
  data,
  datasetQuery,
  id,
  placeholder,
  referencedEntities,
  showSelfColumns = true,
  value,
  onChange,
}: GoalValueInputProps) => {
  const [isMenuOpen, menu] = useDisclosure(false);
  const [menuLevel, setMenuLevel] = useState<MenuLevel>("root");
  const [isEntityPickerOpen, entityPicker] = useDisclosure(false);
  const [pickedEntity, setPickedEntity] = useState<PickedEntity | null>(null);
  const [hasOpenedEntityPicker, setHasOpenedEntityPicker] = useState(false);
  const [fetchCard] = useLazyGetCardQuery();
  const [fetchMeasure] = useLazyGetMeasureQuery();
  const numberInputRef = useRef<HTMLInputElement>(null);

  const foreignRef = isGoalForeignColumnRef(value) ? value : null;
  const selfColumns = showSelfColumns ? getNumericColumnOptions(data.cols) : [];
  const isSelfRef =
    isGoalSelfColumnRef(value) &&
    selfColumns.some((column) => column.name === value);
  const hasRef = foreignRef != null || isSelfRef;

  const entity: GoalForeignEntityRef | null = pickedEntity ?? foreignRef;
  const entityInfo = useReferencedEntity(entity);
  const entityName = entityInfo.name ?? pickedEntity?.name;
  const resolveEntityColumnValue = useEntityColumnValues(
    datasetQuery,
    data,
    entity,
    {
      enabled: menuLevel === "entity" && entityInfo.columns.length > 0,
    },
  );

  const resolved = useResolvedGoalValue(
    datasetQuery,
    data,
    value,
    referencedEntities,
  );
  const selfColumnLabel = isSelfRef
    ? (selfColumns.find((column) => column.name === value)?.label ??
      String(value))
    : null;
  const pillTooltip = getPillTooltip({
    entityColumns: entityInfo.columns,
    entityName,
    foreignRef,
    selfColumnLabel,
  });

  /**
   * Counting semaphore similar to the one in react-use's useAsyncFn.
   * After picking an entity in the entity picker, the next menu level will
   * only appear if the entity's query results have more than 1 column. This
   * can only be determined asynchronously - semaphore exists to make sure
   * the app reacts only to the most recently sent API request (should there be many).
   */
  const pickTokenRef = useRef(0);
  const abandonPendingPick = useCallback(() => {
    pickTokenRef.current += 1;
  }, []);

  useUnmount(abandonPendingPick);

  const closeMenu = () => {
    abandonPendingPick();
    menu.close();
    setMenuLevel("root");
    setPickedEntity(null);
  };

  const commitValue = (newValue: GoalValue | null) => {
    onChange(newValue);
    closeMenu();
  };

  const selectEntityColumn = (columnName: string) => {
    if (entity != null) {
      commitValue({ type: entity.type, id: entity.id, column: columnName });
    }
  };

  const openMenuFromTrigger = () => {
    setMenuLevel("root");
    menu.open();
  };

  const openMenuFromPill = () => {
    if (isSelfRef) {
      setMenuLevel(selfColumns.length > 1 ? "self" : "root");
    } else {
      setMenuLevel(
        entityInfo.isLoading || entityInfo.columns.length > 1
          ? "entity"
          : "root",
      );
    }
    menu.open();
  };

  const selectSelfOption = () => {
    if (selfColumns.length === 1) {
      commitValue(selfColumns[0].name);
    } else {
      setMenuLevel("self");
    }
  };

  const openEntityPicker = () => {
    closeMenu();
    setHasOpenedEntityPicker(true);
    entityPicker.open();
  };

  // Resolves with string when entity only has 1 column - null otherwise
  const fetchSingleColumn = async (
    type: ReferencedEntityType,
    entityId: CardId | MeasureId,
  ): Promise<string | null> => {
    try {
      if (type === "measure") {
        const measure = await fetchMeasure(entityId, true).unwrap();
        return measure.result_column_name ?? null;
      }

      const card = await fetchCard({ id: entityId }, true).unwrap();
      const numericColumns = getNumericColumnOptions(
        card.result_metadata ?? [],
      );
      return numericColumns.length === 1 ? numericColumns[0].name : null;
    } catch {
      return null;
    }
  };

  const handleEntityPicked = async (item: PickedItem) => {
    if (typeof item.id !== "number") {
      return;
    }

    const type: ReferencedEntityType =
      item.model === "measure" ? "measure" : "card";
    const pickToken = ++pickTokenRef.current;

    const soleColumn = await fetchSingleColumn(type, item.id);

    if (pickToken !== pickTokenRef.current) {
      return;
    }

    if (soleColumn != null) {
      commitValue({ type, id: item.id, column: soleColumn });
      return;
    }

    setPickedEntity({ type, id: item.id, name: item.name });
    setMenuLevel("entity");
    menu.open();
  };

  const handlePillKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      commitValue(null);
      setTimeout(() => numberInputRef.current?.focus(), 0);
    }
  };

  return (
    <Box className={S.root} pos="relative">
      <Menu
        closeOnItemClick={false}
        opened={isMenuOpen}
        position="bottom-end"
        onChange={(opened) => {
          if (!opened) {
            closeMenu();
          }
        }}
      >
        <Menu.Target>
          {hasRef ? (
            <GoalValuePill
              aria-label={ariaLabel}
              isMenuOpen={isMenuOpen}
              resolved={resolved}
              tooltip={pillTooltip}
              onKeyDown={handlePillKeyDown}
              onOpenMenu={openMenuFromPill}
              onRemove={() => commitValue(null)}
            />
          ) : (
            <Box>
              <StaticGoalValueInput
                aria-label={ariaLabel}
                id={id}
                inputRef={numberInputRef}
                placeholder={placeholder}
                rightSection={
                  <Tooltip label={t`Pick a dynamic value`}>
                    <ActionIcon
                      aria-label={t`Pick a dynamic value`}
                      className={S.trigger}
                      data-open={isMenuOpen || isEntityPickerOpen}
                      size={ICON_BUTTON_SIZE}
                      onClick={openMenuFromTrigger}
                    >
                      <Icon name="hexagon" />
                    </ActionIcon>
                  </Tooltip>
                }
                value={value}
                onChange={onChange}
              />
            </Box>
          )}
        </Menu.Target>

        <Menu.Dropdown
          miw={
            menuLevel === "root" ? ROOT_MENU_MIN_WIDTH : COLUMN_MENU_MIN_WIDTH
          }
        >
          {menuLevel === "root" && (
            <>
              {selfColumns.length > 0 && (
                <Menu.Item
                  rightSection={<Icon name="chevronright" />}
                  onClick={selectSelfOption}
                >
                  {t`Value from this question`}
                </Menu.Item>
              )}

              <Menu.Item
                rightSection={<Icon name="chevronright" />}
                onClick={openEntityPicker}
              >
                {t`Value from another question`}
              </Menu.Item>
            </>
          )}

          {menuLevel === "self" && (
            <>
              <Menu.Item
                c="text-secondary"
                fz="sm"
                leftSection={<Icon name="chevronleft" size={12} />}
                onClick={() => setMenuLevel("root")}
              >
                {t`Value from this question`}
              </Menu.Item>

              <Menu.Divider />

              {selfColumns.map((column) => (
                <GoalColumnMenuItem
                  key={column.name}
                  label={column.label}
                  resolvedValue={resolveGoalValue(data, column.name).value}
                  selected={value === column.name}
                  onClick={() => commitValue(column.name)}
                />
              ))}
            </>
          )}

          {menuLevel === "entity" && (
            <>
              <Menu.Item
                c="text-secondary"
                fz="sm"
                leftSection={<Icon name="chevronleft" size={12} />}
                onClick={() => setMenuLevel("root")}
              >
                {entityName ?? t`Value from another question`}
              </Menu.Item>

              <Menu.Divider />

              {match(entityInfo)
                .with({ hasError: true }, () => (
                  <Menu.Item disabled>{t`Couldn't load this source`}</Menu.Item>
                ))
                .with({ isLoading: true }, () => (
                  <Group justify="center" p="md">
                    <Loader size="sm" />
                  </Group>
                ))
                .with({ columns: [] }, () => (
                  <Menu.Item disabled>{t`No numeric columns`}</Menu.Item>
                ))
                .otherwise(({ columns }) => {
                  return columns.map((column) => (
                    <GoalColumnMenuItem
                      key={column.name}
                      label={column.label}
                      resolvedValue={resolveEntityColumnValue(column.name)}
                      selected={foreignRef?.column === column.name}
                      onClick={() => selectEntityColumn(column.name)}
                    />
                  ));
                })}
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      <GoalEntityPickers
        hasOpened={hasOpenedEntityPicker}
        opened={isEntityPickerOpen}
        onChange={handleEntityPicked}
        onClose={entityPicker.close}
      />

      {resolved.error != null && (
        <Text c="error" fz="sm" mt="xs">
          {getGoalErrorMessage(resolved.error)}
        </Text>
      )}
    </Box>
  );
};

function getGoalErrorMessage({ reason, message }: GoalRefError): string {
  return match(reason)
    .with("query-failed", () => message ?? t`Couldn't load this value`)
    .with("column-not-found", () => t`This column no longer exists`)
    .with("not-a-number", () => t`This value isn't a number`)
    .exhaustive();
}

function getPillTooltip({
  entityColumns,
  entityName,
  foreignRef,
  selfColumnLabel,
}: {
  entityColumns: ColumnOption[];
  entityName: string | undefined;
  foreignRef: GoalForeignColumnRef | null;
  selfColumnLabel: string | null;
}): string | null {
  if (foreignRef == null) {
    return selfColumnLabel;
  }

  const columnLabel =
    entityColumns.find((column) => column.name === foreignRef.column)?.label ??
    foreignRef.column;

  if (entityName == null) {
    return columnLabel;
  }

  // a measure has a single result column, so its column label is redundant
  if (foreignRef.type === "measure") {
    return entityName;
  }

  return `${entityName} → ${columnLabel}`;
}
