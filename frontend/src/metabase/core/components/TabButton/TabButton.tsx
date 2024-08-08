import type { UniqueIdentifier } from "@dnd-kit/core";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type {
  HTMLAttributes,
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  Ref,
} from "react";
import {
  useEffect,
  useContext,
  useCallback,
  useRef,
  useState,
  forwardRef,
} from "react";
import { t } from "ttag";

import ControlledPopoverWithTrigger from "metabase/components/PopoverWithTrigger/ControlledPopoverWithTrigger";
import { color, lighten } from "metabase/lib/colors";

import type { TabContextType } from "../Tab";
import {
  getTabButtonInputId,
  getTabId,
  getTabPanelId,
  TabContext,
} from "../Tab";

import {
  TabButtonInput,
  TabButtonRoot,
  MenuButton,
  TabButtonInputWrapper,
  TabButtonInputResizer,
} from "./TabButton.styled";
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
      (event: React.KeyboardEvent) => {
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
      <TabButtonInputWrapper
        onDoubleClick={onInputDoubleClick}
        isSelected={isSelected}
        disabled={disabled}
        data-testid={INPUT_WRAPPER_TEST_ID}
      >
        <TabButtonInputResizer aria-hidden="true">
          {label}
        </TabButtonInputResizer>
        <TabButtonInput
          maxLength={75}
          type="text"
          value={label}
          isSelected={isSelected}
          disabled={!isRenaming}
          onChange={onRename}
          onKeyPress={handleInputKeyPress}
          onFocus={e => e.currentTarget.select()}
          onBlur={onFinishRenaming}
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
  extends Omit<TabButtonProps, "onRename" | "onFinishRenaming" | "isRenaming"> {
  onRename: (newLabel: string) => void;
  renameMenuLabel?: string;
  renameMenuIndex?: number;
  canRename?: boolean;
  value: UniqueIdentifier;
}

// These styles need to be here instead of .styled to avoid circular dependency
const borderStyle = css`
  border: 1px solid ${color("brand")};
  box-shadow: 0px 0px 0px 1px ${lighten(color("brand"), 0.28)};
`;
export const RenameableTabButtonStyled = styled(_TabButton)<{
  isRenaming: boolean;
  isSelected: boolean;
  canRename: boolean;
}>`
  ${TabButtonInputWrapper} {
    ${props => props.isRenaming && borderStyle}
    :hover {
      ${props => props.canRename && props.isSelected && borderStyle}
    }
  }
`;

export function RenameableTabButton({
  label: labelProp,
  menuItems: originalMenuItems = [],
  onRename,
  renameMenuLabel = t`Rename`,
  renameMenuIndex = 0,
  canRename = true,
  ...props
}: RenameableTabButtonProps) {
  const { value: selectedValue } = useContext(TabContext);
  const isSelected = props.value === selectedValue;

  const [label, setLabel] = useState(labelProp);
  const [prevLabel, setPrevLabel] = useState(label);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(labelProp);
  }, [labelProp]);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
    }
  }, [isRenaming]);

  const onFinishEditing = () => {
    if (label.length === 0) {
      setLabel(prevLabel);
    } else if (label !== prevLabel) {
      setPrevLabel(label);
      onRename(label);
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
    <RenameableTabButtonStyled
      label={label}
      isSelected={isSelected}
      isRenaming={canRename && isRenaming}
      canRename={canRename}
      onRename={e => setLabel(e.target.value)}
      onFinishRenaming={onFinishEditing}
      onInputDoubleClick={() => setIsRenaming(canRename)}
      menuItems={
        menuItems as TabButtonMenuItem[] /* workaround for styled component swallowing generic type */
      }
      ref={inputRef}
      {...props}
    />
  );
}

export const TabButton = Object.assign(_TabButton, {
  Root: TabButtonRoot,
  Renameable: RenameableTabButton,
});
