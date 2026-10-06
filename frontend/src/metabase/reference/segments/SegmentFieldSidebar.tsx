import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import S from "metabase/reference/components/Sidebar.module.css";
import { SidebarItem } from "metabase/reference/components/SidebarItem";
import type { FieldId, SegmentId } from "metabase-types/api";

interface SegmentFieldSidebarProps {
  segmentId: SegmentId;
  segmentName?: string;
  fieldId: FieldId;
  fieldName?: string;
}

const SegmentFieldSidebar = ({
  segmentId,
  segmentName,
  fieldId,
  fieldName,
}: SegmentFieldSidebarProps) => (
  <div className={S.sidebar}>
    <ul className={CS.mx3}>
      <div>
        <Breadcrumbs
          className={CS.py4}
          crumbs={[
            [t`Segments`, "/reference/segments"],
            [segmentName, `/reference/segments/${segmentId}`],
            [fieldName],
          ]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <SidebarItem
        key={`/reference/segments/${segmentId}/fields/${fieldId}`}
        href={`/reference/segments/${segmentId}/fields/${fieldId}`}
        icon="document"
        name={t`Details`}
      />
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(SegmentFieldSidebar);
