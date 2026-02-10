import { Breadcrumbs, type BreadcrumbsProps, Icon } from "metabase/ui";

import S from "./DataStudioBreadcrumbs.module.css";

interface DataStudioBreadcrumbs extends BreadcrumbsProps {
  loading?: boolean;
}

export const DataStudioBreadcrumbs = ({
  loading,
  ...rest
}: DataStudioBreadcrumbs) => (
  <Breadcrumbs
    className={S.breadcrumbs}
    separator={<Icon size={12} name="chevronright" />}
    fz="sm"
    c="text-secondary"
    style={{ visibility: loading ? "hidden" : undefined }}
    data-testid="data-studio-breadcrumbs"
    {...rest}
  />
);
