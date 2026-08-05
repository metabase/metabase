import { Link } from "metabase/common/components/Link/Link";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { Breadcrumbs, type BreadcrumbsProps, Icon } from "metabase/ui";

import S from "./DataStudioBreadcrumbs.module.css";

interface DataStudioBreadcrumbs extends BreadcrumbsProps {
  loading?: boolean;
}

export const DataStudioBreadcrumbs = ({
  loading,
  children,
  ...rest
}: DataStudioBreadcrumbs) => {
  const worktreeBreadcrumb = PLUGIN_REMOTE_SYNC.useWorktreeBreadcrumb();

  return (
    <Breadcrumbs
      className={S.breadcrumbs}
      separator={<Icon size={12} name="chevronright" />}
      fz="sm"
      c="text-secondary"
      style={{ visibility: loading ? "hidden" : undefined }}
      data-testid="data-studio-breadcrumbs"
      {...rest}
    >
      {worktreeBreadcrumb && (
        <Link
          key="worktree-branch"
          to={worktreeBreadcrumb.url}
          className={S.worktreeBranch}
          data-testid="worktree-breadcrumb"
        >
          <Icon name="git_branch" size={12} />
          {worktreeBreadcrumb.branch}
        </Link>
      )}
      {children}
    </Breadcrumbs>
  );
};
