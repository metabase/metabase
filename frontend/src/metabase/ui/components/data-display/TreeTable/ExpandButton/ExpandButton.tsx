import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Center, Icon, Loader } from "metabase/ui";

import type { ExpandButtonProps } from "../types";

import S from "./ExpandButton.module.css";

export const ExpandButton = memo(function ExpandButton({
  canExpand,
  isExpanded,
  isLoading,
  onClick,
  className,
}: ExpandButtonProps) {
  if (isLoading) {
    return (
      <Center w={16} h={16} className={S.wrapper} aria-hidden="true">
        <Loader size="xs" color="brand" aria-label={t`Loading`} />
      </Center>
    );
  }

  if (!canExpand) {
    return (
      <Center
        w={16}
        h={16}
        className={cx(S.wrapper, S.hidden, className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <Center
      component="button"
      type="button"
      w={16}
      h={16}
      p={0}
      className={cx(S.wrapper, S.button, className)}
      onClick={onClick}
      aria-label={isExpanded ? t`Collapse` : t`Expand`}
      aria-expanded={isExpanded}
      tabIndex={-1}
    >
      <Icon
        name="chevronright"
        size={10}
        className={cx(S.icon, { [S.iconExpanded]: isExpanded })}
      />
    </Center>
  );
});
