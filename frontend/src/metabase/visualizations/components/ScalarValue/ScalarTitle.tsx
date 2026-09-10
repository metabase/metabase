import cx from "classnames";
import { type ReactNode, useCallback, useState } from "react";

import { Markdown } from "metabase/common/components/Markdown";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Ellipsified,
  Flex,
  Icon,
  type IconProps,
  Tooltip,
} from "metabase/ui";

import { LegendLabel } from "../legend/LegendLabel";

import S from "./ScalarValue.module.css";

interface ScalarTitleProps {
  children: ReactNode;
  description?: string | null;
  icon?: IconProps | null;
  getHref?: () => string | undefined;
  onSelectTitle?: () => void;
}

export const ScalarTitle = ({
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

  const tc = useTranslateContent();
  const title = <Ellipsified tooltip={children}>{children}</Ellipsified>;

  return (
    <Flex
      align="center"
      justify="center"
      gap="xxs"
      maw="100%"
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
      <Box fz="md" lh="md" fw={700} c="text-primary" ta="center" miw={0}>
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
      {description && (
        <Tooltip
          label={
            <Markdown dark compact disallowHeading unstyleLinks lineClamp={8}>
              {tc(description)}
            </Markdown>
          }
          maw="22em"
        >
          <Box
            component="span"
            tabIndex={0}
            className={cx(
              S.descriptionIcon,
              CS.hoverChild,
              CS.hoverChildSmooth,
            )}
          >
            <Icon name="info" />
          </Box>
        </Tooltip>
      )}
    </Flex>
  );
};
