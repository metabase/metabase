import { Fragment } from "react";
import { match } from "ts-pattern";

import { useBreadcrumbContext } from "embedding-sdk/hooks/private/use-breadcrumb-context";
import { Badge } from "metabase/common/components/Badge";
import type { IconName } from "metabase/ui";

import { PublicComponentStylesWrapper } from "../PublicComponentStylesWrapper";

import {
  BreadcrumbsPathSeparator,
  PathContainer,
} from "./SdkBreadcrumb.styled";
import type { BreadcrumbItem } from "./SdkBreadcrumbProvider";

export interface SdkBreadcrumbProps {
  className?: string;
  style?: React.CSSProperties;
}

const getBreadcrumbIcon = (type: BreadcrumbItem["type"]) =>
  match<BreadcrumbItem["type"], IconName>(type)
    .with("collection", () => "folder")
    .with("dashboard", () => "dashboard")
    .with("question", () => "question")
    .with("drilldown", () => "chevronright")
    .exhaustive();

export const SdkBreadcrumb = ({ className, style }: SdkBreadcrumbProps) => {
  const { breadcrumbs, navigateToBreadcrumb } = useBreadcrumbContext();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <PublicComponentStylesWrapper className={className} style={style}>
      <PathContainer>
        {breadcrumbs.map((breadcrumb, index) => (
          <Fragment key={breadcrumb.id}>
            <Badge
              icon={{ name: getBreadcrumbIcon(breadcrumb.type) }}
              inactiveColor="text-light"
              isSingleLine
              onClick={
                breadcrumb.isCurrent
                  ? undefined
                  : () => navigateToBreadcrumb(breadcrumb)
              }
            >
              {breadcrumb.name}
            </Badge>

            {index < breadcrumbs.length - 1 && (
              <BreadcrumbsPathSeparator>/</BreadcrumbsPathSeparator>
            )}
          </Fragment>
        ))}
      </PathContainer>
    </PublicComponentStylesWrapper>
  );
};
