import cx from "classnames";
import { type HTMLAttributes, type MouseEvent, forwardRef } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Ellipsified,
  Icon,
  Input,
  Loader,
  Pill,
  Stack,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { formatValue } from "metabase/value-formatting";
import type { GoalValueResult } from "metabase/viz-core";
import type { ColumnSettings } from "metabase-types/api";

import S from "./GoalValuePill.module.css";

type Props = HTMLAttributes<HTMLDivElement> & {
  formatOptions: ColumnSettings | undefined;
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
      formatOptions,
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
      <Input
        className={cx(S.root, className)}
        classNames={{ input: S.input }}
        component="div"
        ref={ref}
        rightSection={
          <Tooltip label={t`Remove value source`}>
            <ActionIcon
              aria-label={t`Remove value source`}
              className={S.trigger}
              data-open={isMenuOpen}
              size="sm"
              variant="subtle"
              onClick={onRemove}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        }
        rightSectionPointerEvents="all"
        role="group"
        tabIndex={0}
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
            bdrs="md"
            display="flex"
            miw={0}
            onAuxClick={handleAuxClick}
            onClick={handleClick}
          >
            <Pill
              classNames={{ root: S.pill, label: S.pillLabel }}
              flex="0 1 auto"
              miw={0}
            >
              <Icon
                c="text-secondary"
                flex="0 0 auto"
                name="hexagon"
                size={12}
              />
              {resolved.isLoading ? (
                <Loader size="xs" />
              ) : (
                <Ellipsified showTooltip={false}>
                  {resolved.value != null
                    ? formatValue(resolved.value, formatOptions)
                    : EMPTY_CELL_PLACEHOLDER}
                </Ellipsified>
              )}
            </Pill>
          </UnstyledButton>
        </Tooltip>
      </Input>
    );
  },
);
