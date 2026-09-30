import cx from "classnames";
import { type HTMLAttributes, type MouseEvent, forwardRef } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Ellipsified,
  Group,
  Icon,
  Loader,
  Stack,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatValue } from "metabase/value-formatting";
import type { GoalValueResult } from "metabase/viz-core";

import { ICON_BUTTON_SIZE } from "../../constants";

import S from "./GoalValuePill.module.css";

type Props = HTMLAttributes<HTMLDivElement> & {
  isMenuOpen: boolean;
  resolved: GoalValueResult;
  tooltip: string | null;
  onOpenMenu: () => void;
  onOpenSource?: () => void;
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
      onOpenSource,
      onRemove,
      ...props
    },
    ref,
  ) {
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      const isCtrlOrMetaClick =
        (event.ctrlKey || event.metaKey) && event.button === 0;

      if (isCtrlOrMetaClick && onOpenSource) {
        onOpenSource();
      } else {
        onOpenMenu();
      }
    };

    const handleAuxClick = (event: MouseEvent<HTMLButtonElement>) => {
      const isMiddleClick = event.button === 1;

      if (isMiddleClick && onOpenSource) {
        onOpenSource();
      }
    };

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
        <Tooltip
          disabled={tooltip == null && onOpenSource == null}
          label={
            <Stack gap="xs">
              {tooltip}
              {onOpenSource && (
                <span>{t`${METAKEY}+click to open in new tab`}</span>
              )}
            </Stack>
          }
        >
          <UnstyledButton
            aria-label={t`Change value source`}
            bdrs="1rem"
            className={S.pill}
            display="flex"
            miw={0}
            pl="0.75rem"
            pr="0.5rem"
            py="0.25rem"
            onAuxClick={handleAuxClick}
            onClick={handleClick}
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
