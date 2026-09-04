import cx from "classnames";
import { type HTMLAttributes, forwardRef } from "react";
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
import { formatValue } from "metabase/value-formatting";
import type { ResolvedGoalValue } from "metabase/viz-core";

import { ICON_BUTTON_SIZE } from "../../constants";

import S from "./GoalValuePill.module.css";

type Props = HTMLAttributes<HTMLDivElement> & {
  isMenuOpen: boolean;
  resolved: ResolvedGoalValue;
  tooltip: string | null;
  onOpenMenu: () => void;
  onRemove: () => void;
};

export const GoalValuePill = forwardRef<HTMLDivElement, Props>(
  function GoalValuePill(
    {
      className,
      isMenuOpen,
      resolved,
      tooltip,
      onOpenMenu,
      onRemove,
      ...props
    },
    ref,
  ) {
    return (
      <Group
        bdrs="sm"
        bg="background_page-primary"
        className={cx(S.root, className)}
        gap="sm"
        h={40}
        px="sm"
        ref={ref}
        role="group"
        tabIndex={0}
        wrap="nowrap"
        {...props}
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
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu();
            }}
          >
            <Icon c="text-secondary" flex="0 0 auto" name="hexagon" size={12} />
            {resolved.isUnanswered ? (
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
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  },
);
