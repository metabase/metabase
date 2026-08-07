import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
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
  useListRecentsQuery,
  useSearchQuery,
} from "metabase/api";
import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Menu,
  NumberInput,
  Text,
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
  SearchRequest,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import S from "./GoalValueInput.module.css";

const MENU_MIN_WIDTH = 225;
const ICON_BUTTON_SIZE = 24;
const TRIGGER_INSET = 8;
// NumberInput sizes its right section to fit the increment controls (27px),
// which leaves the trigger touching the input's border.
const TRIGGER_SECTION_WIDTH = `${ICON_BUTTON_SIZE + 2 * TRIGGER_INSET}px`;
const SEARCH_RESULTS_LIMIT = 5;

// Model lists are module constants because MiniPicker re-runs its search
// whenever the `models` array changes identity.
// Saved questions are reachable through Browse all only.
const ENTITY_PICKER_MODELS: MiniPickerPickableItem["model"][] = [
  "metric",
  "measure",
];
// shown instead when the instance has no metrics or measures at all
const QUESTION_FALLBACK_MODELS: MiniPickerPickableItem["model"][] = [
  "card",
  "dataset",
];
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
  "aria-label"?: string;
};

export const GoalValueInput = ({
  id,
  value,
  onChange,
  data,
  placeholder,
  "aria-label": ariaLabel,
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

  const resolved = resolveGoalValue(value, data);
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

  // An entity picked but never committed must not outlive the menu, or the pill
  // would describe an entity the value doesn't come from.
  const closeMenu = useCallback(() => {
    menu.close();
    setMenuLevel("root");
    setPickedEntity(null);
  }, [menu]);

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
    const sourceColumns = isSelfRef ? selfColumns : entityColumns;
    if (sourceColumns.length > 1) {
      setMenuLevel(isSelfRef ? "self" : "entity");
    } else {
      setMenuLevel("root");
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
    entityPicker.close();
    browseModal.close();
    setPickedEntity({ type, id: item.id, name: item.name });
    setMenuLevel("entity");
    menu.open();

    // Skip column selection when the picked entity has only one column
    try {
      if (type === "measure") {
        const measure = await fetchMeasure(item.id, true).unwrap();
        if (measure.result_column_name) {
          commitValue({
            type,
            id: item.id,
            column: measure.result_column_name,
          });
        }
      } else {
        const card = await fetchCard({ id: item.id }, true).unwrap();
        const numericColumns = (card.result_metadata ?? []).filter(isNumeric);
        if (numericColumns.length === 1) {
          commitValue({ type, id: item.id, column: numericColumns[0].name });
        }
      }
    } catch {
      // metadata failed to load - leave the menu open on the entity level
    }
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
        <Menu.Dropdown miw={MENU_MIN_WIDTH}>
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
                  resolvedValue={resolveGoalValue(column.name, data).value}
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
                <Menu.Item disabled>{t`Couldn't load this question`}</Menu.Item>
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
                        ? resolveGoalValue(
                            {
                              type: entity.type,
                              id: entity.id,
                              column: column.name,
                            },
                            data,
                          ).value
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
      >
        <Box />
      </MiniPicker>

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

// Searches metrics and measures, scoping the empty query to the Library
// metrics collection when one exists. When the instance has no metrics or
// measures at all, falls back to questions, with the most recent ones shown
// for the empty query.
function useEntityPickerSearch(enabled: boolean) {
  const { data: libraryMetricsCollection } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
      skip: !enabled,
    });

  const { data: probe } = useSearchQuery(
    enabled
      ? { models: ["metric", "measure"], limit: 1, context: "entity-picker" }
      : skipToken,
  );
  const shouldFallBackToQuestions = probe?.total === 0;

  const { data: recentItems } = useListRecentsQuery(
    { context: ["selections", "views"] },
    { skip: !shouldFallBackToQuestions },
  );
  const recentQuestionIds = useMemo(
    () =>
      (recentItems ?? [])
        .filter((item) => item.model === "card" || item.model === "dataset")
        .slice(0, SEARCH_RESULTS_LIMIT)
        .map((item) => item.id),
    [recentItems],
  );

  const getSearchParams = useCallback(
    (params: SearchRequest): Partial<SearchRequest> => {
      if (shouldFallBackToQuestions) {
        const showRecents = !params.q && recentQuestionIds.length > 0;
        return {
          limit: SEARCH_RESULTS_LIMIT,
          ...(showRecents ? { ids: recentQuestionIds } : {}),
        };
      }

      const scopeToLibraryMetrics =
        libraryMetricsCollection !== undefined &&
        (libraryMetricsCollection.here?.includes("metric") ||
          libraryMetricsCollection.below?.includes("metric")) &&
        !params.q;

      return {
        limit: SEARCH_RESULTS_LIMIT,
        ...(scopeToLibraryMetrics
          ? { collection: libraryMetricsCollection.id }
          : {}),
      };
    },
    [shouldFallBackToQuestions, recentQuestionIds, libraryMetricsCollection],
  );

  return {
    models: shouldFallBackToQuestions
      ? QUESTION_FALLBACK_MODELS
      : ENTITY_PICKER_MODELS,
    getSearchParams,
  };
}

type GoalColumnMenuItemProps = {
  label: string;
  resolvedValue: number | null;
  isSelected: boolean;
  onClick: () => void;
};

function GoalColumnMenuItem({
  label,
  resolvedValue,
  isSelected,
  onClick,
}: GoalColumnMenuItemProps) {
  return (
    <Menu.Item
      className={cx({ [S.selectedItem]: isSelected })}
      rightSection={
        resolvedValue != null ? (
          <Text c="text-secondary" fz="md">
            {formatValue(resolvedValue)}
          </Text>
        ) : undefined
      }
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );
}

export type StaticGoalValueInputProps = {
  id: string;
  value: GoalValue | null;
  placeholder?: string;
  ariaLabel?: string;
  onCommit: (value: number | null) => void;
  rightSection?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
};

export function StaticGoalValueInput({
  id,
  value,
  placeholder,
  ariaLabel,
  onCommit,
  rightSection,
  inputRef,
}: StaticGoalValueInputProps) {
  // A reference we can't render here (e.g. its column disappeared from the
  // results) still shows an empty input; committing on blur would delete it.
  const numericValue = typeof value === "number" ? value : null;

  return (
    <NumberInput
      id={id}
      ref={inputRef}
      aria-label={ariaLabel}
      placeholder={placeholder}
      w="100%"
      value={numericValue ?? ""}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      rightSectionWidth={
        rightSection == null ? undefined : TRIGGER_SECTION_WIDTH
      }
      onBlur={(event) => {
        const rawValue = event.target.value;
        const newValue = rawValue === "" ? null : parseFloat(rawValue);
        if (newValue !== numericValue) {
          onCommit(newValue);
        }
      }}
    />
  );
}
