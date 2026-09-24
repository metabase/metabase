import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";

import S from "../NodeBuilder.module.css";

import { Shine } from "./Shine";

type ToolbarProps = {
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  areAllCollapsed: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onLoadMbql: () => void;
  onToggleCollapseAll: () => void;
  onVibes: () => void;
};

// The buttons in the canvas's bottom-right corner.
export function Toolbar({
  readOnly,
  canUndo,
  canRedo,
  areAllCollapsed,
  onUndo,
  onRedo,
  onLoadMbql,
  onToggleCollapseAll,
  onVibes,
}: ToolbarProps) {
  const [isVibesPressed, setIsVibesPressed] = useState(false);

  return (
    <div className={S.toolbar}>
      <Shine />
      <Group gap="xs" wrap="nowrap">
        {!readOnly && (
          <>
            <Button
              size="xs"
              variant="default"
              className={cx(S.toolbarButton, S.iconButton)}
              aria-label={t`Undo`}
              disabled={!canUndo}
              leftSection={<Icon name="undo" size={12} />}
              onClick={onUndo}
            />
            <Button
              size="xs"
              variant="default"
              className={cx(S.toolbarButton, S.iconButton)}
              aria-label={t`Redo`}
              disabled={!canRedo}
              leftSection={<Icon name="redo" size={12} />}
              onClick={onRedo}
            />
            <Button
              size="xs"
              variant="default"
              className={S.toolbarButton}
              leftSection={<Icon name="clipboard" size={12} />}
              onClick={onLoadMbql}
            >
              {t`Load MBQL`}
            </Button>
          </>
        )}
        <Button
          size="xs"
          variant="default"
          className={S.toolbarButton}
          leftSection={
            <Icon
              name={areAllCollapsed ? "chevrondown" : "chevronup"}
              size={12}
            />
          }
          onClick={onToggleCollapseAll}
        >
          {/* Both labels are laid out on top of each other so the button
              keeps the wider one's width when it flips. */}
          <span className={S.stableLabel}>
            <span aria-hidden className={S.stableGhost}>
              {t`Collapse all`}
            </span>
            <span aria-hidden className={S.stableGhost}>
              {t`Expand all`}
            </span>
            <span>{areAllCollapsed ? t`Expand all` : t`Collapse all`}</span>
          </span>
        </Button>
        <Button
          size="xs"
          variant="default"
          className={cx(S.toolbarButton, S.vibes, {
            [S.vibesPressed]: isVibesPressed,
          })}
          leftSection={<Icon name="sparkles" size={16} className={S.sparkle} />}
          onClick={() => {
            setIsVibesPressed(true);
            onVibes();
          }}
          onAnimationEnd={() => setIsVibesPressed(false)}
        >
          {t`Vibes`}
        </Button>
      </Group>
    </div>
  );
}
