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
import type { ResolvedGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import { formatValue } from "metabase/visualizations/lib/formatting";

import S from "./GoalValueInput.module.css";
import { ICON_BUTTON_SIZE } from "./constants";

// the div props include what Menu.Target injects, so the menu can anchor here
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
      ...divProps
    },
    ref,
  ) {
    return (
      // bg and 40px height match Mantine's md inputs, so both bound inputs look alike
      <Group
        ref={ref}
        bdrs="sm"
        bg="background_page-primary"
        className={cx(S.refShell, className)}
        gap="sm"
        h={40}
        px="sm"
        role="group"
        tabIndex={0}
        wrap="nowrap"
        {...divProps}
      >
        <Tooltip disabled={tooltip == null} label={tooltip}>
          {/* min-width lets the value ellipsize instead of pushing the remove button out of the shell */}
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
