/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";
import { t } from "c-3po";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const SegmentSidebar = ({ segment, user, style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <ul>
      <div className={S.breadcrumbs}>
        <Breadcrumbs
          className="py4"
          crumbs={[[t`Segments`, "/reference/segments"], [segment.name]]}
          inSidebar={true}
          placeholder={t`Data Reference`}
        />
      </div>
      <SidebarItem
        key={`/reference/segments/${segment.id}`}
        href={`/reference/segments/${segment.id}`}
        icon="document"
        name={t`Details`}
      />
      <SidebarItem
        key={`/reference/segments/${segment.id}/fields`}
        href={`/reference/segments/${segment.id}/fields`}
        icon="fields"
        name={t`Fields in this segment`}
      />
      <SidebarItem
        key={`/reference/segments/${segment.id}/questions`}
        href={`/reference/segments/${segment.id}/questions`}
        icon="all"
        name={t`Questions about this segment`}
      />
      <SidebarItem
        key={`/auto/dashboard/segment/${segment.id}`}
        href={`/auto/dashboard/segment/${segment.id}`}
        icon="bolt"
        name={t`X-ray this segment`}
      />

      <SidebarItem
        key={`/xray/segment/${segment.id}/approximate`}
        href={`/xray/segment/${segment.id}/approximate`}
        icon="all"
        name={t`See an in-depth analysis`}
      />
      {user &&
        user.is_superuser && (
          <SidebarItem
            key={`/reference/segments/${segment.id}/revisions`}
            href={`/reference/segments/${segment.id}/revisions`}
            icon="history"
            name={t`Revision history`}
          />
        )}
    </ul>
  </div>
);

SegmentSidebar.propTypes = {
  segment: PropTypes.object,
  user: PropTypes.object,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default pure(SegmentSidebar);
