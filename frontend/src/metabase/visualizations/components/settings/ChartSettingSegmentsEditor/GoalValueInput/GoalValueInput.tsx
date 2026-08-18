import { useDisclosure } from "@mantine/hooks";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useLazyGetCardQuery, useLazyGetMeasureQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Menu,
  Tooltip,
} from "metabase/ui";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetData,
  GoalValue,
  ReferencedEntityType,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import { StaticGoalValueInput } from "../StaticGoalValueInput";
import { useResolvedGoalValue } from "../use-resolved-goal-value";

import { GoalColumnMenuItem } from "./GoalColumnMenuItem";
import { GoalEntityPickers, type PickedItem } from "./GoalEntityPickers";
import S from "./GoalValueInput.module.css";
import { GoalValuePill } from "./GoalValuePill";
import { ICON_BUTTON_SIZE } from "./constants";
import type { ColumnOption, GoalEntityRef } from "./types";
import { useEntityColumnValues } from "./use-entity-column-values";
import { useReferencedEntity } from "./use-referenced-entity";

const ROOT_MENU_MIN_WIDTH = 225;
const COLUMN_MENU_MIN_WIDTH = 256;

type MenuLevel = "root" | "self" | "entity";

type PickedEntity = GoalEntityRef & { name: string };

export type GoalValueInputProps = {
  "aria-label"?: string;
  data: DatasetData;
  id: string;
  placeholder?: string;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
};

export const GoalValueInput = ({
  "aria-label": ariaLabel,
  data,
  id,
  placeholder,
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
  const selfColumns: ColumnOption[] = data.cols
    .filter(isNumeric)
    .map((column) => ({
      name: column.name,
      label: column.display_name || column.name,
    }));
  const isSelfRef =
    isGoalSelfColumnRef(value) &&
    selfColumns.some((column) => column.name === value);
  const hasRef = foreignRef != null || isSelfRef;

  const entity: GoalEntityRef | null = pickedEntity ?? foreignRef;
  const entityInfo = useReferencedEntity(entity);
  const entityName = entityInfo.name ?? pickedEntity?.name;
  const resolveEntityColumnValue = useEntityColumnValues(data, entity, {
    enabled:
      menuLevel === "entity" && !entityInfo.isLoading && !entityInfo.hasError,
  });

  const resolved = useResolvedGoalValue(data, value);
  const selfColumnLabel = isSelfRef
    ? (selfColumns.find((column) => column.name === value)?.label ??
      String(value))
    : null;
  const foreignColumnLabel = foreignRef
    ? (entityInfo.columns.find((column) => column.name === foreignRef.column)
        ?.label ?? foreignRef.column)
    : null;
  const pillTooltip = foreignRef
    ? entityName
      ? `${entityName} → ${foreignColumnLabel}`
      : foreignColumnLabel
    : selfColumnLabel;

  // A pick resolves asynchronously; bumping the token abandons whatever is in
  // flight so it can't commit a value the user has already navigated away from.
  const pickTokenRef = useRef(0);
  const abandonPendingPick = useCallback(() => {
    pickTokenRef.current += 1;
  }, []);
  useEffect(() => abandonPendingPick, [abandonPendingPick]);

  // An entity picked but never committed must not outlive the menu, or the pill
  // would describe an entity the value doesn't come from.
  const closeMenu = useCallback(() => {
    abandonPendingPick();
    menu.close();
    setMenuLevel("root");
    setPickedEntity(null);
  }, [abandonPendingPick, menu]);

  const commitValue = useCallback(
    (newValue: GoalValue | null) => {
      onChange(newValue);
      closeMenu();
    },
    [onChange, closeMenu],
  );

  const selectEntityColumn = useCallback(
    (columnName: string) => {
      if (entity != null) {
        commitValue({ type: entity.type, id: entity.id, column: columnName });
      }
    },
    [entity, commitValue],
  );

  const openMenuFromTrigger = () => {
    setMenuLevel("root");
    menu.open();
  };

  const openMenuFromPill = () => {
    if (isSelfRef) {
      setMenuLevel(selfColumns.length > 1 ? "self" : "root");
    } else {
      // Until the entity's metadata lands we don't know its column count, so
      // open the column list - it renders a loader while we wait.
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

  /** The picked entity's only numeric column, or null when the user has to choose. */
  const fetchSoleColumn = async (
    type: ReferencedEntityType,
    entityId: number,
  ): Promise<string | null> => {
    try {
      if (type === "measure") {
        const measure = await fetchMeasure(entityId, true).unwrap();
        return measure.result_column_name ?? null;
      }
      const card = await fetchCard({ id: entityId }, true).unwrap();
      const numericColumns = (card.result_metadata ?? []).filter(isNumeric);
      return numericColumns.length === 1 ? numericColumns[0].name : null;
    } catch {
      // metadata failed to load - fall through to the column list, which says so
      return null;
    }
  };

  // Committing here rather than from an effect on `pickedEntity` keeps the
  // settings update out of React's nested-update chain.
  const handleEntityPicked = async (item: PickedItem) => {
    if (typeof item.id !== "number") {
      return;
    }
    const type: ReferencedEntityType =
      item.model === "measure" ? "measure" : "card";
    const pickToken = ++pickTokenRef.current;

    // Resolving the column before touching the menu keeps a single-column pick
    // from flashing a column list open and immediately shut.
    const soleColumn = await fetchSoleColumn(type, item.id);
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

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
        // opening happens only via the hexagon trigger or the pill; the
        // target-wide toggle would otherwise open the menu on any input click
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
              onKeyDown={handleShellKeyDown}
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
                      <Icon name="hexagon" size={16} />
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
                  isSelected={value === column.name}
                  label={column.label}
                  resolvedValue={resolveGoalValue(data, column.name).value}
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
              {entityInfo.hasError ? (
                <Menu.Item disabled>{t`Couldn't load this source`}</Menu.Item>
              ) : entityInfo.isLoading ? (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                </Group>
              ) : entityInfo.columns.length > 0 ? (
                entityInfo.columns.map((column) => (
                  <GoalColumnMenuItem
                    key={column.name}
                    isSelected={foreignRef?.column === column.name}
                    label={column.label}
                    resolvedValue={resolveEntityColumnValue(column.name)}
                    onClick={() => selectEntityColumn(column.name)}
                  />
                ))
              ) : (
                <Menu.Item disabled>{t`No numeric columns`}</Menu.Item>
              )}
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
    </Box>
  );
};
