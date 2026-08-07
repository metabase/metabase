import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useGetMeasureQuery,
  useLazyGetCardQuery,
  useLazyGetMeasureQuery,
} from "metabase/api";
import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Menu,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import { formatValue } from "metabase/visualizations/lib/formatting";
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

import { GoalColumnMenuItem } from "./GoalColumnMenuItem";
import S from "./GoalValueInput.module.css";
import { StaticGoalValueInput } from "./StaticGoalValueInput";
import { useEntityPickerSearch } from "./use-entity-picker-search";

const ROOT_MENU_MIN_WIDTH = 225;
const COLUMN_MENU_MIN_WIDTH = 256;
const ICON_BUTTON_SIZE = 24;

const BROWSE_ALL_MODELS: OmniPickerItem["model"][] = [
  "metric",
  "measure",
  "table",
  "card",
  "dataset",
];
const SELECTABLE_BROWSE_MODELS: Array<OmniPickerItem["model"]> = [
  "metric",
  "measure",
  "card",
  "dataset",
];

type MenuLevel = "root" | "self" | "entity";

type PickedEntity = {
  type: ReferencedEntityType;
  id: number;
  name: string;
};

type ColumnOption = { name: string; label: string };

export type GoalValueInputProps = {
  id: string;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
  data: DatasetData;
  placeholder?: string;
  ariaLabel?: string;
};

export const GoalValueInput = ({
  id,
  value,
  onChange,
  data,
  placeholder,
  ariaLabel,
}: GoalValueInputProps) => {
  const [isMenuOpen, menu] = useDisclosure(false);
  const [menuLevel, setMenuLevel] = useState<MenuLevel>("root");
  const [isEntityPickerOpen, entityPicker] = useDisclosure(false);
  const [isBrowseModalOpen, browseModal] = useDisclosure(false);
  const [pickedEntity, setPickedEntity] = useState<PickedEntity | null>(null);
  const [hasOpenedEntityPicker, setHasOpenedEntityPicker] = useState(false);
  const [fetchCard] = useLazyGetCardQuery();
  const [fetchMeasure] = useLazyGetMeasureQuery();
  const numberInputRef = useRef<HTMLInputElement>(null);

  const { models: entityPickerModels, getSearchParams } = useEntityPickerSearch(
    hasOpenedEntityPicker,
  );

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

  const entity: Pick<PickedEntity, "type" | "id"> | null =
    pickedEntity ?? foreignRef;
  const { data: entityCard, isError: isCardError } = useGetCardQuery(
    entity?.type === "card" ? { id: entity.id } : skipToken,
  );
  const { data: entityMeasure, isError: isMeasureError } = useGetMeasureQuery(
    entity?.type === "measure" ? entity.id : skipToken,
  );
  const hasEntityMetadataError =
    entity != null && (entity.type === "card" ? isCardError : isMeasureError);
  const isEntityMetadataLoading =
    entity != null &&
    !hasEntityMetadataError &&
    (entity.type === "card" ? entityCard == null : entityMeasure == null);

  const entityName =
    (entity?.type === "card" ? entityCard?.name : entityMeasure?.name) ??
    pickedEntity?.name;
  const entityColumns: ColumnOption[] = useMemo(() => {
    if (entity?.type === "card") {
      return (entityCard?.result_metadata ?? [])
        .filter(isNumeric)
        .map((field) => ({
          name: field.name,
          label: field.display_name || field.name,
        }));
    }
    if (entityMeasure?.result_column_name) {
      return [
        { name: entityMeasure.result_column_name, label: entityMeasure.name },
      ];
    }
    return [];
  }, [entity?.type, entityCard, entityMeasure]);

  const resolved = resolveGoalValue(data, value);
  const selfColumnLabel = isSelfRef
    ? (selfColumns.find((column) => column.name === value)?.label ??
      String(value))
    : null;
  const foreignColumnLabel = foreignRef
    ? (entityColumns.find((column) => column.name === foreignRef.column)
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
        isEntityMetadataLoading || entityColumns.length > 1 ? "entity" : "root",
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
  const handleEntityPicked = async (item: {
    id: number | string;
    model: string;
    name: string;
  }) => {
    if (typeof item.id !== "number") {
      return;
    }
    const type: ReferencedEntityType =
      item.model === "measure" ? "measure" : "card";
    const pickToken = ++pickTokenRef.current;
    entityPicker.close();
    browseModal.close();

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
    <Box className={S.root}>
      <Menu
        opened={isMenuOpen}
        // opening happens only via the hexagon trigger or the pill; the
        // target-wide toggle would otherwise open the menu on any input click
        onChange={(opened) => {
          if (!opened) {
            closeMenu();
          }
        }}
        position="bottom-end"
        closeOnItemClick={false}
      >
        <Menu.Target>
          {hasRef ? (
            <div
              className={S.refShell}
              tabIndex={0}
              role="group"
              aria-label={ariaLabel}
              onKeyDown={handleShellKeyDown}
            >
              <Tooltip label={pillTooltip} disabled={pillTooltip == null}>
                <UnstyledButton
                  className={S.pill}
                  aria-label={t`Change value source`}
                  onClick={openMenuFromPill}
                >
                  <Icon name="hexagon" size={12} c="text-secondary" />
                  {resolved.isResolving ? (
                    <Loader size="xs" data-testid="goal-value-loader" />
                  ) : (
                    <span className={S.pillValue}>
                      {resolved.value != null
                        ? formatValue(resolved.value)
                        : "—"}
                    </span>
                  )}
                </UnstyledButton>
              </Tooltip>
              <ActionIcon
                className={S.trigger}
                data-open={isMenuOpen}
                size={ICON_BUTTON_SIZE}
                ml="auto"
                aria-label={t`Remove value source`}
                onClick={() => commitValue(null)}
              >
                <Icon name="close" size={16} />
              </ActionIcon>
            </div>
          ) : (
            <Box>
              <StaticGoalValueInput
                id={id}
                inputRef={numberInputRef}
                value={value}
                placeholder={placeholder}
                ariaLabel={ariaLabel}
                onCommit={onChange}
                rightSection={
                  <ActionIcon
                    className={S.trigger}
                    data-open={isMenuOpen || isEntityPickerOpen}
                    size={ICON_BUTTON_SIZE}
                    aria-label={t`Pick a dynamic value`}
                    onClick={openMenuFromTrigger}
                  >
                    <Icon name="hexagon" size={16} />
                  </ActionIcon>
                }
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
                  leftSection={<ActiveSourceCheck isActive={isSelfRef} />}
                  rightSection={<Icon name="chevronright" />}
                  onClick={selectSelfOption}
                >
                  {t`Value from this question`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={
                  <ActiveSourceCheck isActive={foreignRef != null} />
                }
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
                  isSelected={value === column.name}
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
              {hasEntityMetadataError ? (
                <Menu.Item disabled>{t`Couldn't load this source`}</Menu.Item>
              ) : isEntityMetadataLoading ? (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                </Group>
              ) : entityColumns.length > 0 ? (
                entityColumns.map((column) => (
                  <GoalColumnMenuItem
                    key={column.name}
                    label={column.label}
                    resolvedValue={
                      entity != null
                        ? resolveGoalValue(data, {
                            type: entity.type,
                            id: entity.id,
                            column: column.name,
                          }).value
                        : null
                    }
                    isSelected={foreignRef?.column === column.name}
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

      <MiniPicker
        opened={isEntityPickerOpen}
        onClose={entityPicker.close}
        models={entityPickerModels}
        forceSearch
        showSearchInput
        searchInputPlaceholder={t`Search…`}
        searchParams={getSearchParams}
        onChange={handleEntityPicked}
        onBrowseAll={() => {
          entityPicker.close();
          browseModal.open();
        }}
        menuProps={{ position: "bottom-start" }}
      />

      {isBrowseModalOpen && (
        <EntityPickerModal
          title={t`Pick a measure, metric, or saved question`}
          models={BROWSE_ALL_MODELS}
          onChange={(item) =>
            handleEntityPicked({
              id: item.id,
              model: item.model,
              name: item.name,
            })
          }
          onClose={browseModal.close}
          isSelectableItem={(item: OmniPickerItem) =>
            SELECTABLE_BROWSE_MODELS.includes(item.model) &&
            typeof item.id === "number"
          }
          options={{
            hasConfirmButtons: false,
            hasDatabases: true,
            disableSearchScope: true,
          }}
        />
      )}
    </Box>
  );
};

/**
 * Marks the source the current value comes from. Decorative: keeping it out of
 * the a11y tree stops it from prefixing the menu item's name, and it always
 * occupies its slot so labels line up whether or not it is shown.
 */
function ActiveSourceCheck({ isActive }: { isActive: boolean }) {
  return (
    <Icon
      name="check"
      size={12}
      className={cx({ [S.invisible]: !isActive })}
      aria-hidden
    />
  );
}
