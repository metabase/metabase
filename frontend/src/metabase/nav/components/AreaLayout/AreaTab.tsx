import cx from "classnames";
import type { ReactNode } from "react";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import {
  Box,
  FixedSizeIcon,
  Flex,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabProps = {
  label: string;
  icon: IconName;
  /** Omit to render an action rather than a link, e.g. one that opens a modal. */
  to?: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
  isGated?: boolean;
  onClick?: () => void;
};

export function AreaTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
  isGated,
  onClick,
}: AreaTabProps) {
  const upsellGem = isGated ? <UpsellGem.New size={14} /> : null;
  const effectiveRightSection = rightSection ?? upsellGem;

  // The link and action forms are spelled out separately rather than sharing
  // one Flex: their polymorphic `component` types do not unify, because
  // ForwardRefLink accepts a function className and UnstyledButton does not.
  const className = cx(S.tab, { [S.selected]: isSelected });
  const justify = showLabel ? "start" : "center";

  const content = (
    <>
      <FixedSizeIcon name={icon} display="block" className={S.icon} />
      {showLabel && <Text lh="sm">{label}</Text>}
      {effectiveRightSection && (
        <Box
          className={showLabel ? undefined : S.badgeOverlay}
          ml={showLabel ? "auto" : undefined}
        >
          {effectiveRightSection}
        </Box>
      )}
    </>
  );

  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      {to ? (
        <Flex
          className={className}
          component={ForwardRefLink}
          to={to}
          onClick={onClick}
          p="sm"
          gap="sm"
          bdrs="md"
          aria-label={label}
          aria-current={isSelected ? "page" : undefined}
          justify={justify}
        >
          {content}
        </Flex>
      ) : (
        <Flex
          className={className}
          component={UnstyledButton}
          onClick={onClick}
          p="sm"
          gap="sm"
          bdrs="md"
          aria-label={label}
          justify={justify}
        >
          {content}
        </Flex>
      )}
    </Tooltip>
  );
}
