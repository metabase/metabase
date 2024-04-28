/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import S from "metabase/components/Sidebar.module.css";
import SidebarItem from "metabase/components/SidebarItem";
import CS from "metabase/css/core/index.css";

const SegmentFieldSidebar = ({ segment, field, style, className }) => (
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

SegmentFieldSidebar.propTypes = {
  segment: PropTypes.object,
  field: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default memo(SegmentFieldSidebar);
