import { Tabs as MantineTabs } from "@mantine/core";
import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  forwardRef,
  useCallback,
} from "react";

import { Icon } from "../../icons";

import S from "./Tab.module.css";

const CLOSE_KEYS = ["Delete", "Backspace"];
const CLOSE_ICON_SIZE = 12;

// Derived from the component rather than Mantine's `TabsTabProps` so the
// factory-level props (`renderRoot`, `component`) stay available to callers.
type MantineTabsTabProps = ComponentPropsWithoutRef<typeof MantineTabs.Tab>;

export interface TabsTabProps extends MantineTabsTabProps {
  /**
   * Renders a close control on the tab. Removing the tab is the caller's job:
   * handle `onClose` and drop the tab (and pick a new selection if the closed
   * one was active).
   */
  closable?: boolean;
  onClose?: (value: string) => void;
}

/**
 * The close control is a plain icon, not a button: a `<button>` cannot contain
 * another interactive element. Keyboard users close the focused tab with
 * `Delete` / `Backspace`, following the WAI-ARIA tabs pattern.
 */
export const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(
  function TabsTab(
    { closable, onClose, value, rightSection, onKeyDown, ...props },
    ref,
  ) {
    const handleCloseClick = useCallback(
      (event: MouseEvent<HTMLSpanElement>) => {
        event.stopPropagation();
        onClose?.(value);
      },
      [onClose, value],
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(event);
        if (closable && CLOSE_KEYS.includes(event.key)) {
          event.preventDefault();
          onClose?.(value);
        }
      },
      [closable, onClose, onKeyDown, value],
    );

    return (
      <MantineTabs.Tab
        ref={ref}
        value={value}
        onKeyDown={handleKeyDown}
        data-closable={closable || undefined}
        rightSection={
          closable ? (
            <>
              {rightSection}
              <span
                className={S.tabClose}
                data-testid="tab-close"
                aria-hidden
                onClick={handleCloseClick}
              >
                <Icon name="close" size={CLOSE_ICON_SIZE} />
              </span>
            </>
          ) : (
            rightSection
          )
        }
        {...props}
      />
    );
  },
);
