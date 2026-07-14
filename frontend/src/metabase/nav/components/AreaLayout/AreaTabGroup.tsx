import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useEffect } from "react";

import {
  Box,
  Collapse,
  FixedSizeIcon,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabGroupProps = {
  label: string;
  icon: IconName;
  isActive?: boolean;
  showLabel: boolean;
  children: ReactNode;
};

export function AreaTabGroup({
  label,
  icon,
  isActive,
  showLabel,
  children,
}: AreaTabGroupProps) {
  const [isOpen, { toggle, open }] = useDisclosure(false);

  useEffect(() => {
    if (isActive) {
      open();
    }
  }, [isActive, open]);

  return (
    <Box>
      <Tooltip
        label={label}
        position="right"
        openDelay={TOOLTIP_OPEN_DELAY}
        disabled={showLabel}
      >
        <UnstyledButton
          className={cx(S.tab, { [S.selected]: isActive && !isOpen })}
          onClick={toggle}
          p="sm"
          bdrs="md"
          w="100%"
          aria-label={label}
          aria-expanded={isOpen}
          aria-current={isActive && !isOpen ? "location" : undefined}
        >
          <FixedSizeIcon name={icon} display="block" className={S.icon} />
          {showLabel && (
            <>
              <Text lh="sm" ml="sm">
                {label}
              </Text>
              <FixedSizeIcon
                name="chevrondown"
                display="block"
                className={cx(S.chevron, { [S.chevronOpen]: isOpen })}
                ml="auto"
              />
            </>
          )}
        </UnstyledButton>
      </Tooltip>
      <Collapse in={isOpen}>
        <Stack gap="0.75rem" pt="0.75rem" pl={showLabel ? "md" : undefined}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}
