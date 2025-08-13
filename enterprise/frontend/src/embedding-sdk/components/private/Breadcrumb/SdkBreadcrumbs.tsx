import { Fragment } from "react";
import { match } from "ts-pattern";

import { useSdkBreadcrumb } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";
import { Badge } from "metabase/common/components/Badge";
import type { IconName } from "metabase/ui";

import { PublicComponentStylesWrapper } from "../PublicComponentStylesWrapper";

import {
  BreadcrumbsPathSeparator,
  PathContainer,
} from "./SdkBreadcrumbs.styled";
import type {
  BreadcrumbItem,
  BreadcrumbItemType,
} from "./SdkBreadcrumbsProvider";

export interface SdkBreadcrumbProps {
  className?: string;
  style?: React.CSSProperties;
  onBreadcrumbClick?: (breadcrumb: BreadcrumbItem) => void;
}

export const SdkBreadcrumbs = ({
  className,
  style,
  onBreadcrumbClick,
}: SdkBreadcrumbProps) => {
  const { breadcrumbs } = useSdkBreadcrumb();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <PublicComponentStylesWrapper className={className} style={style}>
      <PathContainer>
        {breadcrumbs.map((breadcrumb, index) => (
          <Fragment key={breadcrumb.id}>
            <Badge
              icon={getBreadcrumbIcon(breadcrumb.type)}
              inactiveColor="text-light"
              isSingleLine
              onClick={() => {
                // TODO: navigate to that breadcrumb item on click.
                // Be mindful that there are multiple actions that are possible:
                // - click on collection -> pop navigation stack, go to that collection
                // - click on question -> pop navigation stack, go to that question
                // - click on dashboard -> pop navigation stack, go to that dashboard

                onBreadcrumbClick?.(breadcrumb);
              }}
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

const getBreadcrumbIcon = (type: BreadcrumbItemType): IconName =>
  match<BreadcrumbItemType, IconName>(type)
    .with("collection", () => "folder")
    .with("dashboard", () => "dashboard")
    .with("question", () => "table2")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .exhaustive();
