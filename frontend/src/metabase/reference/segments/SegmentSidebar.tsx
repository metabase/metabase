import cx from "classnames";
import type { CSSProperties } from "react";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";
import type { Segment, User } from "metabase-types/api";

import { trackReferenceXRayClicked } from "../analytics";

interface SegmentSidebarProps {
  segment: Segment;
  user?: User | null;
  className?: string;
  style?: CSSProperties;
}

const SegmentSidebar = ({
  segment,
  user,
  style,
  className,
}: SegmentSidebarProps) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
          crumbs={[[t`Segments`, "/reference/segments"], [segment.name]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/segments/${segment.id}`}
          href={`/reference/segments/${segment.id}`}
          icon="document"
          name={t`Details`}
        />
        <SidebarItem
          key={`/reference/segments/${segment.id}/fields`}
          href={`/reference/segments/${segment.id}/fields`}
          icon="field"
          name={t`Fields in this segment`}
        />
        <SidebarItem
          key={`/reference/segments/${segment.id}/questions`}
          href={`/reference/segments/${segment.id}/questions`}
          icon="folder"
          name={t`Questions about this segment`}
        />
        {MetabaseSettings.get("enable-xrays") && (
          <SidebarItem
            key={`/auto/dashboard/segment/${segment.id}`}
            href={`/auto/dashboard/segment/${segment.id}`}
            icon="bolt"
            name={t`X-ray this segment`}
            onClick={() => trackReferenceXRayClicked("segment")}
          />
        )}
        {user && user.is_superuser && (
          <SidebarItem
            key={`/reference/segments/${segment.id}/revisions`}
            href={`/reference/segments/${segment.id}/revisions`}
            icon="history"
            name={t`Revision history`}
          />
        )}
      </ol>
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(SegmentSidebar);
