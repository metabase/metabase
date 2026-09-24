import cx from "classnames";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";

import S from "../NodeBuilder.module.css";

type ToolbarProps = {
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  areAllCollapsed: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleCollapseAll: () => void;
  onPrettify: () => void;
};

// The buttons in the canvas's bottom-right corner.
export function Toolbar({
  readOnly,
  canUndo,
  canRedo,
  areAllCollapsed,
  onUndo,
  onRedo,
  onToggleCollapseAll,
  onPrettify,
}: ToolbarProps) {
  return (
    <div className={S.toolbar}>
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
          className={S.toolbarButton}
          leftSection={<Icon name="grid" size={12} />}
          onClick={onPrettify}
        >
          {t`Prettify`}
        </Button>
      </Group>
    </div>
  );
}
