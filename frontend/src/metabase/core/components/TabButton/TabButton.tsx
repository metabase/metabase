import {
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
import styled from "@emotion/styled";
import { t } from "ttag";

import { css } from "@emotion/react";
import ControlledPopoverWithTrigger from "metabase/components/PopoverWithTrigger/ControlledPopoverWithTrigger";

import { color, lighten } from "metabase/lib/colors";
import {
  getTabButtonInputId,
  getTabId,
  getTabPanelId,
  TabContext,
  TabContextType,
} from "../Tab";
import { TabButtonMenu } from "./TabButtonMenu";
import {
  TabButtonInput,
  TabButtonRoot,
  MenuButton,
  TabButtonInputWrapper,
  TabButtonInputResizer,
} from "./TabButton.styled";

export const INPUT_WRAPPER_TEST_ID = "tab-button-input-wrapper";

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
  onRename?: ChangeEventHandler<HTMLInputElement>;
  onFinishRenaming?: () => void;
  isRenaming?: boolean;
  onInputDoubleClick?: MouseEventHandler<HTMLSpanElement>;
  disabled?: boolean;
}

const _TabButton = forwardRef(function TabButton<T>(
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
  extends Omit<
    TabButtonProps<T>,
    "onRename" | "onFinishRenaming" | "isRenaming"
  > {
  onRename: (newLabel: string) => void;
  renameMenuLabel?: string;
  renameMenuIndex?: number;
  canRename?: boolean;
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
    &:hover,
    :focus {
      ${props => props.canRename && props.isSelected && borderStyle}
    }
  }
`;

export function RenameableTabButton<T>({
  label: labelProp,
  menuItems: originalMenuItems = [],
  onRename,
  renameMenuLabel = t`Rename`,
  renameMenuIndex = 0,
  canRename = true,
  ...props
}: RenameableTabButtonProps<T>) {
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

  const renameItem = {
    label: renameMenuLabel,
    action: () => {
      setIsRenaming(true);
    },
  };
  const menuItems = [
    ...originalMenuItems.slice(0, renameMenuIndex),
    renameItem,
    ...originalMenuItems.slice(renameMenuIndex),
  ];

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
        menuItems as TabButtonMenuItem<unknown>[] /* workaround for styled component swallowing generic type */
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
