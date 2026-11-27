import { type ReactNode, useCallback, useState } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import {
  Box,
  Ellipsified,
  Flex,
  Icon,
  type IconProps,
  Tooltip,
} from "metabase/ui";
import { useIsTruncated } from "metabase/ui/hooks/use-is-truncated";

import { LegendLabel } from "../legend/LegendLabel";

import S from "./ScalarValue.module.css";

const DESCRIPTION_TOOLTIP_MAX_WIDTH = "22em";
// The line height of the description's Markdown paragraphs.
const DESCRIPTION_LINE_HEIGHT = "1.57em";

interface ScalarTitleProps {
  size?: "sm" | "md";
  children: ReactNode;
  description?: string | null;
  icon?: IconProps | null;
  getHref?: () => string | undefined;
  onSelectTitle?: () => void;
}

export const ScalarTitle = ({
  size = "md",
  children,
  description,
  icon,
  getHref,
  onSelectTitle,
}: ScalarTitleProps) => {
  const [href, setHref] = useState(() => getHref?.());
  const computeHref = useCallback(() => {
    if (getHref) {
      setHref(getHref());
    }
  }, [getHref]);

  const { isTruncated, ref } = useIsTruncated<HTMLDivElement>({
    ignoreHeightTruncation: true,
  });
  const hasTooltip = isTruncated || Boolean(description);
  // Without a link the title has no tab stop to open the description from.
  const needsTabStop = Boolean(description) && !onSelectTitle;

  // A title above a description takes its line height, and a blank line apart.
  const tooltipTitleSpacing = description ? DESCRIPTION_LINE_HEIGHT : undefined;

  const title = <Ellipsified showTooltip={false}>{children}</Ellipsified>;

  return (
    <Flex
      align="center"
      justify="center"
      gap="xxs"
      maw="100%"
      miw={0}
      data-testid="scalar-title"
    >
      {icon && (
        <Icon
          className={S.titleIcon}
          name={icon.name}
          color={icon.color}
          size={icon.size}
          tooltip={icon.tooltip}
        />
      )}
      <Tooltip
        disabled={!hasTooltip}
        maw={description ? DESCRIPTION_TOOLTIP_MAX_WIDTH : undefined}
        label={
          <>
            {isTruncated && (
              <Box lh={tooltipTitleSpacing} mb={tooltipTitleSpacing}>
                {children}
              </Box>
            )}
            {description && (
              <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
                {description}
              </Markdown>
            )}
          </>
        }
      >
        <Box
          ref={ref}
          className={S.titleText}
          fz={size}
          lh={size}
          fw={700}
          c="text-primary"
          ta="center"
          miw={0}
          tabIndex={needsTabStop ? 0 : undefined}
        >
          {onSelectTitle ? (
            <LegendLabel
              className={S.titleLink}
              href={href}
              onClick={onSelectTitle}
              onFocus={computeHref}
              onMouseEnter={computeHref}
              onMouseDown={computeHref}
              onTouchStart={computeHref}
            >
              {title}
            </LegendLabel>
          ) : (
            title
          )}
        </Box>
      </Tooltip>
    </Flex>
  );
};
