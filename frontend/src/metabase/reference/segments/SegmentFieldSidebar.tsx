import cx from "classnames";
import type { CSSProperties } from "react";
import { memo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import S from "metabase/common/components/Sidebar.module.css";
import { SidebarItem } from "metabase/common/components/SidebarItem";
import CS from "metabase/css/core/index.css";
import type { Field, Segment } from "metabase-types/api";

interface SegmentFieldSidebarProps {
  segment: Segment;
  field: Field;
  className?: string;
  style?: CSSProperties;
}

const SegmentFieldSidebar = ({
  segment,
  field,
  style,
  className,
}: SegmentFieldSidebarProps) => (
  <div className={cx(S.sidebar, className)} style={style}>
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
