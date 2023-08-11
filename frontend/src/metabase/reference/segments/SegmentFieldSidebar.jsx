/* eslint "react/prop-types": "warn" */
import { memo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import S from "metabase/components/Sidebar.css";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import SidebarItem from "metabase/components/SidebarItem";

const SegmentFieldSidebar = ({ segment, field, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul className="mx3">
      <div className={S.breadcrumbs}>
        <Breadcrumbs
          className="py4"
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

SegmentFieldSidebar.propTypes = {
  segment: PropTypes.object,
  field: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default memo(SegmentFieldSidebar);
