import type { UniqueIdentifier } from "@dnd-kit/core";
import cx from "classnames";
import type {
  ChangeEventHandler,
  HTMLAttributes,
  KeyboardEvent,
  KeyboardEventHandler,
  MouseEventHandler,
  Ref,
} from "react";
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Flex, Icon, Popover } from "metabase/ui";

import type { TabContextType } from "../Tab";
import {
  TabContext,
  getTabButtonInputId,
  getTabId,
  getTabPanelId,
} from "../Tab";

import S from "./TabButton.module.css";
import { TabButtonMenu } from "./TabButtonMenu";

export const INPUT_WRAPPER_TEST_ID = "tab-button-input-wrapper";

export type TabButtonMenuAction = (
  context: TabContextType,
  value: UniqueIdentifier | null,
) => void;

export interface TabButtonMenuItem {
  label: string;
  action: TabButtonMenuAction;
}

export interface TabButtonProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: UniqueIdentifier | null;
  showMenu?: boolean;
  menuItems?: TabButtonMenuItem[];
  onRename?: ChangeEventHandler<HTMLInputElement>;
  onFinishRenaming?: () => void;
  isRenaming?: boolean;
  onInputDoubleClick?: MouseEventHandler<HTMLSpanElement>;
  disabled?: boolean;
  /** Frames the label on hover while the tab is selected, hinting that a double click renames it */
  canRename?: boolean;
}

const PlainTabButton = forwardRef(function PlainTabButton(
  {
    value,
    menuItems,
    label,
    onClick,
    onRename,
    onFinishRenaming,
    onInputDoubleClick,
    disabled = false,
    isRenaming = false,
    canRename = false,
    showMenu: showMenuProp = true,
    className,
    ...props
  }: TabButtonProps,
  inputRef: Ref<HTMLInputElement>,
) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const isSelected = value === selectedValue;

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showMenu =
    showMenuProp && menuItems !== undefined && menuItems.length > 0;

  const handleButtonClick: MouseEventHandler<HTMLDivElement> = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        disabled ||
        // Unjustified type cast. FIXME
        menuButtonRef.current?.contains(event.target as Node) ||
        (typeof inputRef === "object" &&
          // Unjustified type cast. FIXME
          inputRef?.current?.contains(event.target as Node))
      ) {
        return;
      }
      onClick?.(event);
      onChange?.(value);
    },
    [value, onClick, onChange, disabled, inputRef],
  );

  const handleInputKeyPress: KeyboardEventHandler<HTMLInputElement> =
    useCallback(
      (event: KeyboardEvent) => {
        if (event.nativeEvent.isComposing) {
          return;
        }
        if (event.key === "Enter" && typeof inputRef === "object") {
          inputRef?.current?.blur();
        }
      },
      [inputRef],
    );

  return (
    <Flex
      {...props}
      className={cx(
        S.root,
        {
          [S.selected]: isSelected && !disabled,
          [S.disabled]: disabled,
        },
        disabled ? CS.cursorDefault : CS.cursorPointer,
        className,
      )}
      pos="relative"
      fz="md"
      fw={700}
      onClick={handleButtonClick}
      role="tab"
      aria-selected={isSelected}
      aria-controls={getTabPanelId(idPrefix, value)}
      aria-disabled={disabled}
      aria-label={label}
      id={getTabId(idPrefix, value)}
    >
      <Box
        component="span"
        className={cx(S.inputWrapper, {
          [S.renaming]: isRenaming,
          [S.renameable]: canRename && isSelected,
        })}
        pos="relative"
        p="xxs"
        bdrs="xs"
        lh={1.15}
        onDoubleClick={onInputDoubleClick}
        data-testid={INPUT_WRAPPER_TEST_ID}
      >
        <Box component="span" className={S.resizer} aria-hidden="true">
          {label}
        </Box>
        <Box
          component="input"
          className={S.input}
          pos="absolute"
          left={0}
          bottom="-1px"
          w="100%"
          p="xxs"
          bdrs="xxs"
          fw="bold"
          ta="center"
          maxLength={75}
          type="text"
          value={label}
          disabled={!isRenaming}
          onChange={onRename}
          onKeyPress={handleInputKeyPress}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={onFinishRenaming}
          aria-labelledby={getTabId(idPrefix, value)}
          id={getTabButtonInputId(idPrefix, value)}
          ref={inputRef}
        />
      </Box>
      {showMenu && (
        <Popover
          opened={isMenuOpen}
          onChange={setIsMenuOpen}
          position="bottom-start"
          trapFocus
        >
          <Popover.Target>
            <ActionIcon
              variant="subtle"
              size="xs"
              className={cx(S.menuButton, {
                [S.menuButtonOpen]: isMenuOpen && !disabled,
              })}
              onClick={() => setIsMenuOpen(true)}
              ref={menuButtonRef}
              disabled={disabled}
            >
              <Icon name="chevrondown" size={10} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <TabButtonMenu
              menuItems={menuItems}
              value={value}
              closePopover={() => setIsMenuOpen(false)}
            />
          </Popover.Dropdown>
        </Popover>
      )}
    </Flex>
  );
});

export interface RenameableTabButtonProps extends Omit<
  TabButtonProps,
  "onRename" | "onFinishRenaming" | "isRenaming"
> {
  onRename: (newLabel: string) => void;
  renameMenuLabel?: string;
  renameMenuIndex?: number;
  canRename?: boolean;
  value: UniqueIdentifier;
}

export function RenameableTabButton({
  label: labelProp,
  menuItems: originalMenuItems = [],
  onRename,
  renameMenuLabel = t`Rename`,
  renameMenuIndex = 0,
  canRename = true,
  tabIndex,
  ...props
}: RenameableTabButtonProps) {
  const tc = useTranslateContent();

  // Only translate the label if it is not editable
  const maybeTranslatedLabelProp = canRename ? labelProp : tc(labelProp);

  const [label, setLabel] = useState(labelProp);

  const [prevLabel, setPrevLabel] = useState(label);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(maybeTranslatedLabelProp);
  }, [maybeTranslatedLabelProp]);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
    }
  }, [isRenaming]);

  const onFinishEditing = () => {
    const trimmedLabel = label.trim();

    if (trimmedLabel.length === 0) {
      setLabel(prevLabel);
    } else if (trimmedLabel !== prevLabel) {
      setPrevLabel(trimmedLabel);
      onRename(trimmedLabel);
    }
    setIsRenaming(false);
  };

  let menuItems = [...originalMenuItems];
  if (canRename) {
    const renameItem = {
      label: renameMenuLabel,
      action: () => {
        setIsRenaming(true);
      },
    };
    menuItems = [
      ...menuItems.slice(0, renameMenuIndex),
      renameItem,
      ...menuItems.slice(renameMenuIndex),
    ];
  }

  return (
    <PlainTabButton
      label={label}
      isRenaming={canRename && isRenaming}
      canRename={canRename}
      onRename={(e) => setLabel(e.target.value)}
      onFinishRenaming={onFinishEditing}
      onInputDoubleClick={() => setIsRenaming(canRename)}
      menuItems={menuItems}
      ref={inputRef}
      {...props}
    />
  );
}

export const TabButton = Object.assign(PlainTabButton, {
  Renameable: RenameableTabButton,
});
