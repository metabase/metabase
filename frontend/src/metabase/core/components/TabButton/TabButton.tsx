import React, {
  useEffect,
  useContext,
  useCallback,
  useRef,
  useState,
  HTMLAttributes,
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  forwardRef,
  Ref,
} from "react";
import { t } from "ttag";

import ControlledPopoverWithTrigger from "metabase/components/PopoverWithTrigger/ControlledPopoverWithTrigger";

import {
  getTabButtonInputId,
  getTabId,
  getTabPanelId,
  TabContext,
  TabContextType,
} from "../Tab";
import {
  TabButtonInput,
  TabButtonRoot,
  MenuButton,
  TabButtonInputWrapper,
  TabButtonInputResizer,
} from "./TabButton.styled";
import TabButtonMenu from "./TabButtonMenu";

export type TabButtonMenuAction<T> = (
  context: TabContextType,
  value: T,
) => void;

export interface TabButtonMenuItem<T> {
  label: string;
  action: TabButtonMenuAction<T>;
}

export interface TabButtonProps<T> extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: T;
  showMenu?: boolean;
  menuItems?: TabButtonMenuItem<T>[];
  onEdit?: ChangeEventHandler<HTMLInputElement>;
  onFinishEditing?: () => void;
  isEditing?: boolean;
  canEdit?: boolean;
  disabled?: boolean;
}

const TabButton = forwardRef(function TabButton<T>(
  {
    value,
    menuItems,
    label,
    onClick,
    onEdit,
    onFinishEditing,
    disabled = false,
    isEditing = false,
    canEdit = true,
    showMenu: showMenuProp = true,
    ...props
  }: TabButtonProps<T>,
  inputRef: Ref<HTMLInputElement>,
) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const isSelected = value === selectedValue;

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showMenu =
    showMenuProp && menuItems !== undefined && menuItems.length > 0;

  const handleButtonClick: MouseEventHandler<HTMLDivElement> = useCallback(
    event => {
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
      event => {
        if (event.key === "Enter" && typeof inputRef === "object") {
          inputRef?.current?.blur();
        }
      },
      [inputRef],
    );

  return (
    <TabButtonRoot
      {...props}
      onClick={handleButtonClick}
      isSelected={isSelected}
      disabled={disabled}
      role="tab"
      aria-selected={isSelected}
      aria-controls={getTabPanelId(idPrefix, value)}
      aria-disabled={disabled}
      aria-label={label}
      id={getTabId(idPrefix, value)}
    >
      <TabButtonInputWrapper>
        <TabButtonInputResizer aria-hidden="true">
          {label}
        </TabButtonInputResizer>
        <TabButtonInput
          type="text"
          value={label}
          isSelected={isSelected}
          disabled={!canEdit || (!isEditing && !isSelected)}
          onChange={onEdit}
          onKeyPress={handleInputKeyPress}
          onFocus={e => e.currentTarget.select()}
          onBlur={onFinishEditing}
          aria-labelledby={getTabId(idPrefix, value)}
          id={getTabButtonInputId(idPrefix, value)}
          ref={inputRef}
        />
      </TabButtonInputWrapper>
      {showMenu && (
        <ControlledPopoverWithTrigger
          visible={isMenuOpen}
          onOpen={() => setIsMenuOpen(true)}
          onClose={() => setIsMenuOpen(false)}
          renderTrigger={({ onClick }) => (
            <MenuButton
              icon="chevrondown"
              iconSize={10}
              isSelected={isSelected}
              isOpen={isMenuOpen}
              onClick={onClick}
              ref={menuButtonRef}
              disabled={disabled}
            />
          )}
          popoverContent={({ closePopover }) => (
            <TabButtonMenu<T>
              menuItems={menuItems}
              value={value}
              closePopover={closePopover}
            />
          )}
        />
      )}
    </TabButtonRoot>
  );
});

export interface RenameableTabButtonProps<T>
  extends Omit<TabButtonProps<T>, "onEdit" | "onFinishEditing" | "isEditing"> {
  onRename: (newLabel: string) => void;
  renameMenuLabel?: string;
  renameMenuIndex?: number;
}

export function RenameableTabButton<T>({
  label: labelProp,
  menuItems: originalMenuItems = [],
  onRename,
  renameMenuLabel = t`Rename`,
  renameMenuIndex = 0,
  ...props
}: RenameableTabButtonProps<T>) {
  const [label, setLabel] = useState(labelProp);
  const [prevLabel, setPrevLabel] = useState(label);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(labelProp);
  }, [labelProp]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const onFinishEditing = () => {
    if (label.length === 0) {
      setLabel(prevLabel);
    } else if (label !== prevLabel) {
      setPrevLabel(label);
      onRename(label);
    }
    setIsEditing(false);
  };

  const renameItem = {
    label: renameMenuLabel,
    action: () => {
      setIsEditing(true);
    },
  };
  const menuItems = [
    ...originalMenuItems.slice(0, renameMenuIndex),
    renameItem,
    ...originalMenuItems.slice(renameMenuIndex),
  ];

  return (
    <TabButton
      label={label}
      isEditing={isEditing}
      onEdit={e => setLabel(e.target.value)}
      onFinishEditing={onFinishEditing}
      menuItems={menuItems}
      ref={inputRef}
      {...props}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(TabButton, {
  Root: TabButtonRoot,
  Renameable: RenameableTabButton,
});
