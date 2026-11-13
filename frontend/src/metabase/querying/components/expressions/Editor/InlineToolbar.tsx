import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Divider } from "metabase/ui";

import type { ExpressionSidebarName } from "../ExpressionSidebar";

import S from "./Editor.module.css";

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
  const isDocsOpen = openSidebar === "functions";
  return (
    <div className={S.inlineToolbar}>
      {start}
      <Button
        size="sm"
        variant="subtle"
        color="neutral"
        className={S.toolbarButton}
        aria-pressed={isDocsOpen}
        onClick={() => onToggleSidebar("functions")}
      >{t`Docs`}</Button>
      {end != null && <Divider orientation="vertical" />}
      {end}
    </div>
  );
}
