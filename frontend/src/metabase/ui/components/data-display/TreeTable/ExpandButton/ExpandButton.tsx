import cx from "classnames";
import type { MouseEvent } from "react";
import { t } from "ttag";

import { Icon, Loader } from "metabase/ui";

import S from "./ExpandButton.module.css";

interface ExpandButtonProps {
  hasChildren: boolean;
  isExpanded: boolean;
  isLoading?: boolean;
  onClick: (event: MouseEvent) => void;
  className?: string;
}

/**
 * Expand/collapse chevron for tree nodes.
 */
export function ExpandButton({
  hasChildren,
  isExpanded,
  isLoading,
  onClick,
  className,
}: ExpandButtonProps) {
  if (isLoading) {
    return (
      <div className={cx(S.expandButton, className)} aria-hidden="true">
        <Loader size="xs" color="brand" aria-label={t`Loading`} />
      </div>
    );
  }

  return (
    <div
      className={cx(S.expandButton, className, {
        [S.expandButtonHidden]: !hasChildren,
      })}
      onClick={hasChildren ? onClick : undefined}
      aria-hidden="true"
    >
      {hasChildren && (
        <Icon
          name="chevronright"
          size={10}
          className={cx(S.expandIcon, {
            [S.expandIconExpanded]: isExpanded,
          })}
        />
      )}
    </div>
  );
}
