import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";

import type { StubbedField, StubbedSegment } from "../types";

interface SegmentFieldSidebarProps {
  segment: StubbedSegment;
  field: StubbedField;
}

const SegmentFieldSidebar = ({ segment, field }: SegmentFieldSidebarProps) => (
  <div className={S.sidebar}>
    <ul className={CS.mx3}>
      <div>
        <Breadcrumbs
          className={CS.py4}
          crumbs={[
            [t`Segments`, "/reference/segments"],
            [segment.name, `/reference/segments/${segment.id}`],
            [field.name],
          ]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <SidebarItem
        key={`/reference/segments/${segment.id}/fields/${field.id}`}
        href={`/reference/segments/${segment.id}/fields/${field.id}`}
        icon="document"
        name={t`Details`}
      />
    </ul>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(SegmentFieldSidebar);
