import { Fragment } from "react";

import { useBreadcrumbContext } from "embedding-sdk/hooks/use-breadcrumb-context";
import { Button } from "metabase/ui";

import type { BreadcrumbItem } from "./BreadcrumbProvider";

export interface SdkBreadcrumbsProps {
  className?: string;
  style?: React.CSSProperties;
}

const getBreadcrumbIcon = (type: BreadcrumbItem["type"]) => {
  switch (type) {
    case "collection":
      return "folder";
    case "dashboard":
      return "dashboard";
    case "question":
      return "question";
    case "drilldown":
      return "drill";
    default:
      return "chevronright";
  }
};

export const SdkBreadcrumbs = ({ className, style }: SdkBreadcrumbsProps) => {
  const { breadcrumbs, navigateToBreadcrumb } = useBreadcrumbContext();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0",
        ...style,
      }}
    >
      {breadcrumbs.map((breadcrumb, index) => (
        <Fragment key={breadcrumb.id}>
          {breadcrumb.isCurrent ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "var(--mb-color-text-dark)",
                fontWeight: 600,
              }}
            >
              <span>{breadcrumb.name}</span>
            </span>
          ) : (
            <Button
              variant="subtle"
              size="sm"
              leftIcon={getBreadcrumbIcon(breadcrumb.type)}
              onClick={() => navigateToBreadcrumb(breadcrumb.id)}
              style={{
                color: "var(--mb-color-text-medium)",
                textDecoration: "none",
              }}
            >
              {breadcrumb.name}
            </Button>
          )}

          {index < breadcrumbs.length - 1 && (
            <span
              style={{
                color: "var(--mb-color-text-light)",
                fontSize: "0.875rem",
              }}
            >
              /
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
};
