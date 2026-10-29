import { useState } from "react";
import { createPortal } from "react-dom";

import {
  Icon,
  SegmentedControl,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import type { SegmentedPrototypeSetting } from "../types";
import { usePrototypeSetting } from "../use-prototype-setting";

import S from "./PrototypeVersionSwitcher.module.css";

interface PrototypeVersionSwitcherProps {
  setting: SegmentedPrototypeSetting;
  label: string;
}

/**
 * Prototype: a floating bar at the bottom of the window that switches between
 * the versions of a prototype, like developer tools. It changes the same
 * value as the prototype settings menu, and a click on the icon hides it to
 * a small button.
 */
export function PrototypeVersionSwitcher({
  setting,
  label,
}: PrototypeVersionSwitcherProps) {
  const [value, setValue] = usePrototypeSetting(setting);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return createPortal(
      <Tooltip label={label}>
        <UnstyledButton
          className={S.collapsed}
          aria-label={label}
          data-testid="prototype-version-switcher"
          onClick={() => setIsCollapsed(false)}
        >
          <Icon name="beaker" size={14} />
        </UnstyledButton>
      </Tooltip>,
      document.body,
    );
  }

  return createPortal(
    <div className={S.switcher} data-testid="prototype-version-switcher">
      <UnstyledButton
        className={S.hideButton}
        aria-label={`Hide ${label}`}
        onClick={() => setIsCollapsed(true)}
      >
        <Icon name="beaker" size={14} />
      </UnstyledButton>
      <Text size="sm" fw="bold" c="text-secondary">
        {label}
      </Text>
      <SegmentedControl
        aria-label={label}
        value={value}
        data={setting.options.map((option) => ({ ...option }))}
        onChange={setValue}
      />
    </div>,
    document.body,
  );
}
