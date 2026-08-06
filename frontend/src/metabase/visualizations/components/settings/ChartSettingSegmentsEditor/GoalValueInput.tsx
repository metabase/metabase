import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery, useGetMeasureQuery } from "metabase/api";
import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
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

// stable references - MiniPicker's onSearchResults loops otherwise
const ENTITY_PICKER_MODELS: MiniPickerPickableItem["model"][] = [
  "metric",
  "measure",
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
  allowQuestionReference?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

export const GoalValueInput = ({
  id,
  value,
  onChange,
  data,
  allowQuestionReference = false,
  placeholder,
  "aria-label": ariaLabel,
}: GoalValueInputProps) => {
  const [isMenuOpen, menu] = useDisclosure(false);
  const [menuLevel, setMenuLevel] = useState<MenuLevel>("root");
  const [isEntityPickerOpen, entityPicker] = useDisclosure(false);
  const [isBrowseModalOpen, browseModal] = useDisclosure(false);
  const [pickedEntity, setPickedEntity] = useState<PickedEntity | null>(null);
  const [isAutoSelectPending, setIsAutoSelectPending] = useState(false);

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
  const { data: entityCard } = useGetCardQuery(
    entity?.type === "card" ? { id: entity.id } : skipToken,
  );
  const { data: entityMeasure } = useGetMeasureQuery(
    entity?.type === "measure" ? entity.id : skipToken,
  );
  const isEntityMetadataLoading =
    entity != null &&
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

  const closeMenu = useCallback(() => {
    menu.close();
    setMenuLevel("root");
  }, [menu]);

  const commitValue = useCallback(
    (newValue: GoalValue | null) => {
      onChange(newValue);
      closeMenu();
      setPickedEntity(null);
      setIsAutoSelectPending(false);
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

  // Skip column selection when the picked entity has only one column
  useEffect(() => {
    if (!isAutoSelectPending || pickedEntity == null) {
      return;
    }
    if (isEntityMetadataLoading) {
      return;
    }
    if (entityColumns.length === 1) {
      commitValue({
        type: pickedEntity.type,
        id: pickedEntity.id,
        column: entityColumns[0].name,
      });
    } else {
      setIsAutoSelectPending(false);
    }
  }, [
    isAutoSelectPending,
    pickedEntity,
    isEntityMetadataLoading,
    entityColumns,
    commitValue,
  ]);

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
    entityPicker.open();
  };

  const handleEntityPicked = (item: {
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
    setIsAutoSelectPending(true);
    setMenuLevel("entity");
    menu.open();
  };

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      commitValue(null);
    }
  };

  const getSearchParams = useLibraryScopedSearchParams();

  if (!allowQuestionReference) {
    return (
      <StaticGoalValueInput
        id={id}
        value={value}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onCommit={onChange}
      />
    );
  }

  return (
    <Box className={S.root}>
      <Menu
        opened={isMenuOpen}
        onChange={(opened) => (opened ? menu.open() : closeMenu())}
        position="bottom-end"
        closeOnItemClick={false}
      >
        <Menu.Target>
          {hasRef ? (
            <div
              className={S.refShell}
              tabIndex={0}
              role="button"
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
                        ? String(formatValue(resolved.value))
                        : "—"}
                    </span>
                  )}
                </UnstyledButton>
              </Tooltip>
              <Box flex={1} />
              <UnstyledButton
                className={S.trigger}
                aria-label={t`Remove value source`}
                onClick={() => commitValue(null)}
              >
                <Icon name="close" size={16} />
              </UnstyledButton>
            </div>
          ) : (
            <Box>
              <StaticGoalValueInput
                id={id}
                value={value}
                placeholder={placeholder}
                ariaLabel={ariaLabel}
                onCommit={onChange}
                rightSection={
                  <UnstyledButton
                    className={S.trigger}
                    data-open={isMenuOpen || isEntityPickerOpen}
                    aria-label={t`Pick a dynamic value`}
                    onClick={openMenuFromTrigger}
                  >
                    <Icon name="hexagon" size={16} />
                  </UnstyledButton>
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
                {t`A measure, metric, or saved question`}
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
                {entityName ?? t`Pick a value`}
              </Menu.Item>
              <Menu.Divider />
              {isEntityMetadataLoading ? (
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
        models={ENTITY_PICKER_MODELS}
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

function useLibraryScopedSearchParams() {
  const { data: libraryMetricsCollection } =
    PLUGIN_LIBRARY.useGetLibraryChildCollectionByType({
      type: "library-metrics",
    });

  return useCallback(
    (params: SearchRequest): Partial<SearchRequest> => {
      const scopeToLibraryMetrics =
        libraryMetricsCollection !== undefined &&
        (libraryMetricsCollection.here?.includes("metric") ||
          libraryMetricsCollection.below?.includes("metric")) &&
        !params.q;

      return {
        limit: 5,
        ...(scopeToLibraryMetrics
          ? { collection: libraryMetricsCollection.id }
          : {}),
      };
    },
    [libraryMetricsCollection],
  );
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
            {String(formatValue(resolvedValue))}
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
};

export function StaticGoalValueInput({
  id,
  value,
  placeholder,
  ariaLabel,
  onCommit,
  rightSection,
}: StaticGoalValueInputProps) {
  return (
    <NumberInput
      id={id}
      aria-label={ariaLabel}
      placeholder={placeholder}
      w="100%"
      value={typeof value === "number" ? value : ""}
      rightSection={rightSection}
      rightSectionPointerEvents="all"
      onBlur={(event) => {
        const rawValue = event.target.value;
        const newValue = rawValue === "" ? null : parseFloat(rawValue);
        if (newValue !== value) {
          onCommit(newValue);
        }
      }}
    />
  );
}
