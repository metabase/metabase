import { useDisclosure } from "@mantine/hooks";
import { useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import type { OmniPickerQuestionItem } from "metabase/common/components/Pickers";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import type { IconModel } from "metabase/common/utils/icon";
import { useGetIcon } from "metabase/hooks/use-icon";
import {
  Box,
  type ComboboxItem,
  Group,
  Icon,
  Menu,
  NumberInput,
  TextInput,
  Tooltip,
} from "metabase/ui";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  CardType,
  DatasetColumn,
  GoalForeignColumnRef,
  GoalValue,
} from "metabase-types/api";
import {
  isGoalForeignColumnRef,
  isGoalSelfColumnRef,
} from "metabase-types/guards";

import S from "./ChartSettingFieldPicker/ChartSettingFieldPicker.module.css";

const RIGHT_SECTION_WIDTH = "38px";
const MENU_MIN_WIDTH = 320;

const inputStyles = {
  input: {
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
  },
  section: {
    backgroundColor: "unset",
    zIndex: "initial",
  },
};

const columnRefInputStyles = {
  ...inputStyles,
  input: {
    ...inputStyles.input,
    textOverflow: "ellipsis",
  },
};

type MenuLevel = "root" | "self" | "foreign";

const CARD_TYPE_TO_ICON_MODEL = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const satisfies Record<CardType, IconModel>;

export type ChartSettingGoalInputProps = {
  allowQuestionReference?: boolean;
  id: string;
  value: GoalValue;
  onChange: (value: GoalValue) => void;
  columns?: DatasetColumn[];
  valueField?: string;
};

export const ChartSettingGoalInput = ({
  allowQuestionReference = false,
  id,
  value,
  onChange,
  columns = [],
  valueField,
}: ChartSettingGoalInputProps) => {
  const [isMenuOpen, menu] = useDisclosure(false);
  const [menuLevel, setMenuLevel] = useState<MenuLevel>("root");
  const [isCardPickerOpen, cardPicker] = useDisclosure(false);
  const [pickedCard, setPickedCard] = useState<GoalForeignColumnRef | null>(
    null,
  );
  const numberInputRef = useRef<HTMLInputElement>(null);
  const getIcon = useGetIcon();

  const numericColumns: ComboboxItem[] = columns
    .filter(isNumeric)
    .map((column) => ({
      value: column.name,
      label: column.display_name || column.name,
    }));
  const selfColumns = numericColumns.filter(
    (column) => column.value !== valueField,
  );

  const foreignRef = isGoalForeignColumnRef(value) ? value : null;
  const isSelfColumnReference =
    isGoalSelfColumnRef(value) &&
    numericColumns.some((column) => column.value === value);
  const numericValue = typeof value === "number" ? value : 0;

  const hasSelfColumnOption = numericColumns.length > 0;
  const hasMenu = hasSelfColumnOption || allowQuestionReference;

  const foreignCardId = pickedCard?.card_id ?? foreignRef?.card_id ?? null;
  const { data: foreignCard } = useGetCardQuery(
    foreignCardId != null ? { id: foreignCardId } : skipToken,
  );
  const foreignCardName = pickedCard?.column ?? foreignCard?.name;
  const foreignCardIcon = foreignCard
    ? getIcon({
        model: CARD_TYPE_TO_ICON_MODEL[foreignCard.type],
        display: foreignCard.display,
      }).name
    : "search";
  const foreignColumns: ComboboxItem[] = (foreignCard?.result_metadata ?? [])
    .filter(isNumeric)
    .map((field) => ({
      value: field.name,
      label: field.display_name || field.name,
    }));

  const selfColumnRef = isSelfColumnReference
    ? numericColumns.find((column) => column.value === value)
    : null;
  const foreignColumnLabel = foreignRef
    ? (foreignCard?.result_metadata?.find(
        (field) => field.name === foreignRef.column,
      )?.display_name ?? foreignRef.column)
    : "";
  const foreignRefLabel = foreignRef
    ? foreignCardName
      ? `${foreignCardName} · ${foreignColumnLabel}`
      : foreignColumnLabel
    : "";

  const initialMenuLevel: MenuLevel = foreignRef
    ? "foreign"
    : isSelfColumnReference
      ? "self"
      : "root";

  const closeMenu = () => {
    menu.close();
    setMenuLevel("root");
  };

  const selectCustomValue = () => {
    onChange(numericValue);
    closeMenu();
    setTimeout(() => {
      numberInputRef.current?.focus();
      numberInputRef.current?.select();
    }, 0);
  };

  const selectSelfColumn = (columnName: string) => {
    onChange(columnName);
    closeMenu();
  };

  const selectForeignColumn = (columnName: string) => {
    if (foreignCardId != null) {
      onChange({ card_id: foreignCardId, column: columnName });
      closeMenu();
    }
  };

  const openQuestionPicker = () => {
    menu.close();
    cardPicker.open();
  };

  const goToForeignLevel = () => {
    setMenuLevel("foreign");
    if (foreignCardId == null) {
      openQuestionPicker();
    }
  };

  const handleQuestionPicked = (item: OmniPickerQuestionItem) => {
    setPickedCard({ card_id: item.id, column: item.name });
    cardPicker.close();
    setMenuLevel("foreign");
    menu.open();
  };

  const rightSection = hasMenu ? (
    <Menu
      opened={isMenuOpen}
      onChange={(opened) => {
        if (opened) {
          setMenuLevel(initialMenuLevel);
          menu.open();
        } else {
          closeMenu();
        }
      }}
      position="bottom-end"
      closeOnItemClick={false}
    >
      <Menu.Target>
        <Box component="span" className={S.chevronTarget}>
          <Icon name="chevrondown" />
        </Box>
      </Menu.Target>
      <Menu.Dropdown miw={MENU_MIN_WIDTH}>
        {menuLevel === "root" && (
          <>
            <Menu.Item onClick={selectCustomValue}>{t`Custom value`}</Menu.Item>

            {hasSelfColumnOption && (
              <Menu.Item
                rightSection={<Icon name="chevronright" />}
                onClick={() => setMenuLevel("self")}
              >
                {t`From this question…`}
              </Menu.Item>
            )}

            {allowQuestionReference && (
              <Menu.Item
                rightSection={<Icon name="chevronright" />}
                onClick={goToForeignLevel}
              >
                {t`From another question…`}
              </Menu.Item>
            )}
          </>
        )}

        {menuLevel === "self" && (
          <>
            <Menu.Item
              leftSection={<Icon name="chevronleft" />}
              onClick={() => setMenuLevel("root")}
            >
              {t`Back`}
            </Menu.Item>

            <Menu.Divider />

            {selfColumns.map((column) => (
              <Menu.Item
                key={column.value}
                pl={value === column.value ? undefined : "xl"}
                leftSection={
                  value === column.value ? <Icon name="check" /> : undefined
                }
                onClick={() => selectSelfColumn(column.value)}
              >
                {column.label}
              </Menu.Item>
            ))}
          </>
        )}

        {menuLevel === "foreign" && (
          <>
            <Menu.Item
              leftSection={<Icon name="chevronleft" />}
              onClick={() => setMenuLevel("root")}
            >
              {t`Back`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon color="brand" name={foreignCardIcon} />}
              onClick={openQuestionPicker}
            >
              {foreignCardName ? foreignCardName : t`Pick a question…`}
            </Menu.Item>
            {foreignCardId != null && <Menu.Divider />}
            {foreignCardId != null && (
              <Box>
                {foreignColumns.length > 0 ? (
                  foreignColumns.map((column) => (
                    <Menu.Item
                      key={column.value}
                      pl={
                        foreignRef?.column === column.value ? undefined : "xl"
                      }
                      leftSection={
                        foreignRef?.column === column.value ? (
                          <Icon name="check" />
                        ) : undefined
                      }
                      onClick={() => selectForeignColumn(column.value)}
                    >
                      {column.label}
                    </Menu.Item>
                  ))
                ) : (
                  <Menu.Item disabled>{t`No numeric columns`}</Menu.Item>
                )}
              </Box>
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  ) : null;

  return (
    <>
      {foreignRef ? (
        <Tooltip label={foreignRefLabel}>
          <Group
            className={S.root}
            bg="background_page-primary"
            align="center"
            w="100%"
          >
            <TextInput
              id={id}
              value={foreignColumnLabel}
              readOnly
              placeholder={foreignColumnLabel}
              leftSection={<Icon name={foreignCardIcon} c="brand" />}
              rightSection={rightSection}
              rightSectionPointerEvents="all"
              rightSectionWidth={RIGHT_SECTION_WIDTH}
              styles={columnRefInputStyles}
              w="100%"
            />
          </Group>
        </Tooltip>
      ) : isSelfColumnReference ? (
        <Group
          className={S.root}
          bg="background_page-primary"
          align="center"
          w="100%"
        >
          <TextInput
            id={id}
            value={selfColumnRef?.label || String(value)}
            readOnly
            placeholder={selfColumnRef?.label || String(value)}
            rightSection={rightSection}
            rightSectionPointerEvents="all"
            rightSectionWidth={RIGHT_SECTION_WIDTH}
            styles={columnRefInputStyles}
            w="100%"
          />
        </Group>
      ) : (
        <Group
          className={S.root}
          bg="background_page-primary"
          align="center"
          w="100%"
        >
          <NumberInput
            ref={numberInputRef}
            id={id}
            value={numericValue}
            onChange={(newValue) => onChange(newValue ?? 0)}
            placeholder={t`Enter goal value`}
            rightSection={rightSection}
            rightSectionPointerEvents="all"
            rightSectionWidth={RIGHT_SECTION_WIDTH}
            styles={inputStyles}
            w="100%"
          />
        </Group>
      )}
      {isCardPickerOpen && (
        <QuestionPickerModal
          title={t`Pick a question`}
          onChange={handleQuestionPicked}
          onClose={() => {
            cardPicker.close();
            setMenuLevel("root");
          }}
        />
      )}
    </>
  );
};
