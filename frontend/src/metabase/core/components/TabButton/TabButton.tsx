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
import { TabButtonInput, TabButtonRoot, MenuButton } from "./TabButton.styled";
import TabButtonMenu from "./TabButtonMenu";

export type TabButtonValue = string | number;

export type TabButtonMenuAction = (
  context: TabContextType,
  value?: TabButtonValue,
) => void;

export interface TabButtonMenuItem {
  label: string;
  action: TabButtonMenuAction;
}

export interface TabButtonProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value?: TabButtonValue;
  showMenu?: boolean;
  menuItems?: TabButtonMenuItem[];
  onEdit?: ChangeEventHandler<HTMLInputElement>;
  onFinishEditing?: () => void;
  isEditing?: boolean;
  disabled?: boolean;
}

const TabButton = forwardRef(function TabButton(
  {
    value,
    menuItems,
    label,
    onClick,
    onEdit,
    onFinishEditing,
    disabled = false,
    isEditing = false,
    showMenu: showMenuProp = true,
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
        if (event.key !== "Enter") {
          return;
        }
        if (typeof inputRef === "object") {
          inputRef?.current?.blur();
        }
        onFinishEditing?.();
      },
      [onFinishEditing, inputRef],
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
      id={getTabId(idPrefix, value)}
    >
      <TabButtonInput
        type="text"
        value={label}
        isSelected={isSelected}
        disabled={!isEditing}
        onChange={onEdit}
        onKeyPress={handleInputKeyPress}
        onFocus={e => e.currentTarget.select()}
        onBlur={onFinishEditing}
        id={getTabButtonInputId(idPrefix, value)}
        ref={inputRef}
      />

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
            <TabButtonMenu
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

export interface RenameableTabButtonProps
  extends Omit<TabButtonProps, "onEdit" | "onFinishEditing" | "isEditing"> {
  onRename: (newLabel: string) => void;
  renameMenuLabel?: string;
  renameMenuIndex?: number;
}

export function RenameableTabButton({
  label: originalLabel,
  menuItems: originalMenuItems = [],
  onRename,
  renameMenuLabel = t`Rename`,
  renameMenuIndex = 0,
  ...props
}: RenameableTabButtonProps) {
  const [label, setLabel] = useState(originalLabel);
  const [prevLabel, setPrevLabel] = useState(label);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

export default Object.assign(TabButton, {
  Root: TabButtonRoot,
  Renameable: RenameableTabButton,
});
