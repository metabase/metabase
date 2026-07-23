import cx from "classnames";
import {
  type ComponentProps,
  Fragment,
  type ReactElement,
  isValidElement,
} from "react";

import { Breadcrumb } from "metabase/common/components/Breadcrumb";
import { Box, Flex } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import type { DataSourcePart } from "../QuestionDataSource/utils";

import HeaderBreadcrumbsS from "./HeaderBreadcrumbs.module.css";

const HeaderBreadcrumb = (props: ComponentProps<typeof Breadcrumb>) => (
  <Breadcrumb className={HeaderBreadcrumbsS.HeaderBreadcrumb} {...props} />
);

function getBadgeInactiveColor({
  variant,
  isLast,
}: {
  variant: "head" | "subhead";
  isLast: boolean;
}) {
  return isLast && variant === "head" ? "text-primary" : "text-disabled";
}

interface HeadBreadcrumbsProps {
  className?: string;
  variant?: "head" | "subhead";
  parts: DataSourcePart[];
  divider?: string | ReactElement;
  inactiveColor?: ColorName;
  isObjectDetail?: boolean;
}

export function HeadBreadcrumbs({
  variant = "head",
  parts,
  divider,
  inactiveColor,
  ...props
}: HeadBreadcrumbsProps) {
  const { isObjectDetail, ...rest } = props;
  return (
    <Flex
      align="center"
      wrap="wrap"
      data-testid="head-crumbs-container"
      className={cx(HeaderBreadcrumbsS.Container, {
        [HeaderBreadcrumbsS.headVariant]: variant === "head",
      })}
      {...rest}
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
              <HeaderBreadcrumb
                to={part.href}
                color={badgeInactiveColor}
                icon={part.icon}
              >
                {part.name}
              </HeaderBreadcrumb>
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

HeadBreadcrumbs.Breadcrumb = HeaderBreadcrumb;
