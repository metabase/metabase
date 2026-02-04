import cx from "classnames";
import type { CSSProperties } from "react";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";

interface BaseSidebarProps {
  className?: string;
  style?: CSSProperties;
}

const BaseSidebar = ({ style, className }: BaseSidebarProps) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <div>
      <Breadcrumbs
        className={cx(CS.py4, CS.ml3)}
        crumbs={[[t`Data Reference`]]}
        inSidebar={true}
        placeholder={t`Data Reference`}
      />
    </div>
    <ol className={CS.mx3}>
      <SidebarItem
        key="/reference/segments"
        href="/reference/segments"
        icon="segment"
        name={t`Segments`}
      />
      <SidebarItem
        key="/reference/databases"
        href="/reference/databases"
        icon="database"
        name={t`Our data`}
      />
      <SidebarItem
        key="/reference/glossary"
        href="/reference/glossary"
        icon="globe"
        name={t`Glossary`}
      />
    </ol>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(BaseSidebar);
