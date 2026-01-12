import { ActionIcon } from "@mantine/core";
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
    <ActionIcon
      aria-expanded={isExpanded}
      aria-label={isExpanded ? t`Collapse` : t`Expand`}
      className={cx(S.wrapper, S.button, className)}
      onClick={onClick}
      size="1rem"
      tabIndex={-1}
    >
      <Icon
        className={cx(S.icon, { [S.iconExpanded]: isExpanded })}
        name="chevronright"
        size={10}
      />
    </ActionIcon>
  );
});
