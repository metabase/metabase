import { Fragment } from "react";
import { match } from "ts-pattern";

import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import type {
  SdkBreadcrumbItem,
  SdkBreadcrumbItemType,
} from "embedding-sdk-bundle/types/breadcrumb";
import { Badge } from "metabase/common/components/Badge";
import { Flex, type IconName } from "metabase/ui";

import { PublicComponentStylesWrapper } from "../PublicComponentStylesWrapper";

import S from "./SdkBreadcrumbs.module.css";

export interface SdkBreadcrumbProps {
  className?: string;
  style?: React.CSSProperties;
  onBreadcrumbClick?: (breadcrumb: SdkBreadcrumbItem) => void;
}

export const SdkBreadcrumbs = ({
  className,
  style,
  onBreadcrumbClick,
}: SdkBreadcrumbProps) => {
  const { breadcrumbs, navigateTo } = useSdkBreadcrumbs();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <PublicComponentStylesWrapper className={className} style={style}>
      <Flex align="center" data-testid="sdk-breadcrumbs">
        {breadcrumbs.map((breadcrumb, index) => (
          <Fragment key={breadcrumb.id}>
            <Badge
              icon={getBreadcrumbIcon(breadcrumb.type)}
              inactiveColor="text-tertiary"
              isSingleLine
              onClick={() => {
                navigateTo(breadcrumb);
                onBreadcrumbClick?.(breadcrumb);
              }}
            >
              {breadcrumb.name}
            </Badge>

            {index < breadcrumbs.length - 1 && (
              <div className={S.BreadcrumbsPathSeparator}>/</div>
            )}
          </Fragment>
        ))}
      </Flex>
    </PublicComponentStylesWrapper>
  );
};

const getBreadcrumbIcon = (type: SdkBreadcrumbItemType): IconName =>
  match<SdkBreadcrumbItemType, IconName>(type)
    .with("collection", () => "folder")
    .with("dashboard", () => "dashboard")
    .with("question", () => "table2")
    .with("model", () => "model")
    .with("metric", () => "metric")
    .exhaustive();
