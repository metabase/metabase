import cx from "classnames";
import {
  type ComponentProps,
  Fragment,
  type ReactElement,
  isValidElement,
} from "react";

import { Badge } from "metabase/components/Badge";
import { Box, Flex } from "metabase/ui";

import type { DataSourcePart } from "../QuestionDataSource/utils";

import HeaderBreadcrumbsS from "./HeaderBreadcrumbs.module.css";

const HeaderBadge = (props: ComponentProps<typeof Badge>) => (
  <Badge
    classNames={{
      root: HeaderBreadcrumbsS.HeaderBadge,
      icon: HeaderBreadcrumbsS.HeaderBadgeIcon,
    }}
    {...props}
  />
);

function getBadgeInactiveColor({
  variant,
  isLast,
}: {
  variant: "head" | "subhead";
  isLast: boolean;
}) {
  return isLast && variant === "head" ? "text-dark" : "text-light";
}

interface HeadBreadcrumbsProps {
  variant?: "head" | "subhead";
  parts: DataSourcePart[];
  divider?: string | ReactElement;
  inactiveColor?: string;
}

export function HeadBreadcrumbs({
  variant = "head",
  parts,
  divider,
  inactiveColor,
  ...props
}: HeadBreadcrumbsProps) {
  return (
    <Flex
      align="center"
      wrap="wrap"
      data-testid="head-crumbs-container"
      className={cx(HeaderBreadcrumbsS.Container, {
        [HeaderBreadcrumbsS.headVariant]: variant === "head",
      })}
      {...props}
    >
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        const badgeInactiveColor =
          inactiveColor || getBadgeInactiveColor({ variant, isLast });
        return (
          <Fragment key={index}>
            {isDataSourceReactElement(part) ? (
              part
            ) : (
              <HeaderBadge
                to={part.href}
                icon={part.icon}
                inactiveColor={badgeInactiveColor}
              >
                {part.name}
              </HeaderBadge>
            )}
            {!isLast &&
              (isDividerReactElement(divider) ? (
                divider
              ) : (
                <Divider char={divider} />
              ))}
          </Fragment>
        );
      })}
    </Flex>
  );
}

function Divider({ char = "/" }: { char?: string }) {
  return (
    <Box component="span" className={HeaderBreadcrumbsS.HeaderBreadcrumbs}>
      {char}
    </Box>
  );
}

function isDataSourceReactElement(part: DataSourcePart): part is ReactElement {
  return isValidElement(part);
}

function isDividerReactElement(
  divider?: string | ReactElement,
): divider is ReactElement {
  return isValidElement(divider);
}

HeadBreadcrumbs.Badge = HeaderBadge;
