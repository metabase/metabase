import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import S from "metabase/reference/components/Sidebar.module.css";
import { SidebarItem } from "metabase/reference/components/SidebarItem";
import MetabaseSettings from "metabase/utils/settings";
import type { SegmentId, User } from "metabase-types/api";

import { trackReferenceXRayClicked } from "../analytics";

interface SegmentSidebarProps {
  segmentId: SegmentId;
  segmentName?: string;
  user?: User | null;
}

const SegmentSidebar = ({
  segmentId,
  segmentName,
  user,
}: SegmentSidebarProps) => (
  <div className={S.sidebar}>
    <ul>
      <div>
        <Breadcrumbs
          className={cx(CS.py4, CS.ml3)}
          crumbs={[[t`Segments`, "/reference/segments"], [segmentName]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <ol className={CS.mx3}>
        <SidebarItem
          key={`/reference/segments/${segmentId}`}
          href={`/reference/segments/${segmentId}`}
          icon="document"
          name={t`Details`}
        />
        <SidebarItem
          key={`/reference/segments/${segmentId}/fields`}
          href={`/reference/segments/${segmentId}/fields`}
          icon="field"
          name={t`Fields in this segment`}
        />
        <SidebarItem
          key={`/reference/segments/${segmentId}/questions`}
          href={`/reference/segments/${segmentId}/questions`}
          icon="folder"
          name={t`Questions about this segment`}
        />
        {MetabaseSettings.get("enable-xrays") && (
          <SidebarItem
            key={`/auto/dashboard/segment/${segmentId}`}
            href={`/auto/dashboard/segment/${segmentId}`}
            icon="bolt"
            name={t`X-ray this segment`}
            onClick={() => trackReferenceXRayClicked("segment")}
          />
        )}
        {user && user.is_superuser && (
          <SidebarItem
            key={`/reference/segments/${segmentId}/revisions`}
            href={`/reference/segments/${segmentId}/revisions`}
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
