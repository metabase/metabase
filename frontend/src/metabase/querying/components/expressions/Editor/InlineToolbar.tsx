import type { ReactNode } from "react";
import { t } from "ttag";

import { Tooltip, UnstyledButton } from "metabase/ui";

import type { ExpressionSidebarName } from "../ExpressionSidebar";

import S from "./Editor.module.css";
import InfoIcon from "./info.svg?component";

type InlineToolbarProps = {
  openSidebar: ExpressionSidebarName | null;
  start?: ReactNode;
  end?: ReactNode;
  onToggleSidebar: (name: ExpressionSidebarName) => void;
};

export function InlineToolbar({
  openSidebar,
  start,
  end,
  onToggleSidebar,
}: InlineToolbarProps) {
  return (
    <div className={S.inlineToolbar}>
      <div className={S.segments}>
        {start}
        <ToolbarSegment
          icon={<InfoIcon />}
          label={t`Docs`}
          isPressed={openSidebar === "functions"}
          onClick={() => onToggleSidebar("functions")}
        />
      </div>
      {end}
    </div>
  );
}

/** An icon button in the group of buttons at the start of the toolbar. */
export function ToolbarSegment({
  icon,
  label,
  isPressed,
  disabled,
  onClick,
}: {
  /** A 12px icon. Icons of the icon set are drawn at 16px and blur at 12px. */
  icon: ReactNode;
  label: string;
  isPressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <UnstyledButton
        className={S.segment}
        aria-label={label}
        aria-pressed={isPressed}
        disabled={disabled}
        onClick={onClick}
      >
        {icon}
      </UnstyledButton>
    </Tooltip>
  );
}
