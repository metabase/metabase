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

import { Button } from "metabase/common/components/Button";
import { ControlledPopoverWithTrigger } from "metabase/common/components/PopoverWithTrigger/ControlledPopoverWithTrigger";
import { useTranslateContent } from "metabase/i18n/hooks";

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
  canRename?: boolean;
  onInputDoubleClick?: MouseEventHandler<HTMLSpanElement>;
  disabled?: boolean;
}

const _TabButton = forwardRef(function TabButton(
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
        menuButtonRef.current?.contains(event.target as Node) ||
        (typeof inputRef === "object" &&
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
    <div
      {...props}
      className={cx(
        S.root,
        {
          [S.rootSelected]: isSelected && !disabled,
          [S.rootDisabled]: disabled,
        },
        className,
      )}
      onClick={handleButtonClick}
      role="tab"
      aria-selected={isSelected}
      aria-controls={getTabPanelId(idPrefix, value)}
      aria-disabled={disabled}
      aria-label={label}
      id={getTabId(idPrefix, value)}
    >
      <span
        className={cx(S.inputWrapper, {
          [S.inputWrapperRenaming]: isRenaming,
          [S.inputWrapperRenamable]: canRename && isSelected,
        })}
        onDoubleClick={onInputDoubleClick}
        data-testid={INPUT_WRAPPER_TEST_ID}
      >
        <span className={S.inputResizer} aria-hidden="true">
          {label}
        </span>
        <input
          className={cx(S.input, { [S.inputDisabled]: !isRenaming })}
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
      </span>
      {showMenu && (
        <ControlledPopoverWithTrigger
          visible={isMenuOpen}
          onOpen={() => setIsMenuOpen(true)}
          onClose={() => setIsMenuOpen(false)}
          renderTrigger={({ onClick }) => (
            <Button
              className={cx(S.menuButton, {
                [S.menuButtonOpen]: isMenuOpen && !disabled,
                [S.menuButtonDisabled]: disabled,
              })}
              icon="chevrondown"
              iconSize={10}
              onClick={onClick}
              ref={menuButtonRef}
              disabled={disabled}
            />
          )}
          popoverContent={({ closePopover }) => (
            <TabButtonMenu
              menuItems={menuItems}
              value={value}
              closePopover={closePopover}
            />
          )}
        />
      )}
    </div>
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
    <_TabButton
      label={label}
      isRenaming={canRename && isRenaming}
      canRename={canRename}
      onRename={(e) => setLabel(e.target.value)}
      onFinishRenaming={onFinishEditing}
      onInputDoubleClick={() => setIsRenaming(canRename)}
      menuItems={menuItems as TabButtonMenuItem[]}
      ref={inputRef}
      {...props}
    />
  );
}

export const TabButton = Object.assign(_TabButton, {
  Renameable: RenameableTabButton,
});
