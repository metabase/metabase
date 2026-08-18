import { type KeyboardEventHandler, forwardRef } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Ellipsified,
  Group,
  Icon,
  Loader,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { ResolvedGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import { formatValue } from "metabase/visualizations/lib/formatting";

import { ICON_BUTTON_SIZE } from "../constants";

import S from "./GoalValuePill.module.css";

type Props = {
  "aria-label"?: string;
  isMenuOpen: boolean;
  resolved: ResolvedGoalValue;
  tooltip: string | null;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onOpenMenu: () => void;
  onRemove: () => void;
};

export const GoalValuePill = forwardRef<HTMLDivElement, Props>(
  function GoalValuePill(
    {
      "aria-label": ariaLabel,
      isMenuOpen,
      resolved,
      tooltip,
      onKeyDown,
      onOpenMenu,
      onRemove,
    },
    ref,
  ) {
    return (
      <Group
        aria-label={ariaLabel}
        bdrs="sm"
        bg="background_page-primary"
        className={S.root}
        gap="sm"
        h={40}
        px="sm"
        ref={ref}
        role="group"
        tabIndex={0}
        wrap="nowrap"
        onKeyDown={onKeyDown}
      >
        <Tooltip disabled={tooltip == null} label={tooltip}>
          <UnstyledButton
            aria-label={t`Change value source`}
            bdrs="1rem"
            className={S.pill}
            display="flex"
            miw={0}
            pl="0.75rem"
            pr="0.5rem"
            py="0.25rem"
            onClick={onOpenMenu}
          >
            <Icon c="text-secondary" flex="0 0 auto" name="hexagon" size={12} />
            {resolved.isResolving ? (
              <Loader size="xs" />
            ) : (
              <Ellipsified fw={500} showTooltip={false}>
                {resolved.value != null
                  ? formatValue(resolved.value)
                  : EMPTY_CELL_PLACEHOLDER}
              </Ellipsified>
            )}
          </UnstyledButton>
        </Tooltip>

        <Tooltip label={t`Remove value source`}>
          <ActionIcon
            aria-label={t`Remove value source`}
            className={S.trigger}
            data-open={isMenuOpen}
            ml="auto"
            size={ICON_BUTTON_SIZE}
            onClick={onRemove}
          >
            <Icon name="close" size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  },
);
