import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Tooltip as ButtonTooltip, Icon } from "metabase/ui";

import type { ExpressionSidebarName } from "../ExpressionSidebar";

import S from "./Editor.module.css";

type InlineToolbarProps = {
  canFormat: boolean;
  openSidebar: ExpressionSidebarName | null;
  shortcutsMenu?: ReactNode;
  onFormat: () => void;
  onToggleSidebar: (name: ExpressionSidebarName) => void;
};

export function InlineToolbar({
  canFormat,
  openSidebar,
  shortcutsMenu,
  onFormat,
  onToggleSidebar,
}: InlineToolbarProps) {
  return (
    <div className={S.inlineToolbar}>
      <ButtonTooltip label={t`Auto-format`}>
        <ActionIcon
          aria-label={t`Auto-format`}
          onClick={onFormat}
          disabled={!canFormat}
        >
          <Icon name="broom" />
        </ActionIcon>
      </ButtonTooltip>
      {shortcutsMenu}
      <SidebarToggle
        name="functions"
        label={t`Function browser`}
        icon="function"
        openSidebar={openSidebar}
        onToggle={onToggleSidebar}
      />
      <SidebarToggle
        name="columns"
        label={t`Available columns`}
        icon="list"
        openSidebar={openSidebar}
        onToggle={onToggleSidebar}
      />
    </div>
  );
}

function SidebarToggle({
  name,
  label,
  icon,
  openSidebar,
  onToggle,
}: {
  name: ExpressionSidebarName;
  label: string;
  icon: "function" | "list";
  openSidebar: ExpressionSidebarName | null;
  onToggle: (name: ExpressionSidebarName) => void;
}) {
  const isOpen = openSidebar === name;
  return (
    <ButtonTooltip label={label}>
      <ActionIcon
        variant={isOpen ? "filled" : "default"}
        aria-label={label}
        aria-pressed={isOpen}
        onClick={() => onToggle(name)}
      >
        <Icon name={icon} />
      </ActionIcon>
    </ButtonTooltip>
  );
}
