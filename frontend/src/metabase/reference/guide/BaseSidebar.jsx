/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import S from "metabase/components/Sidebar.module.css";
import SidebarItem from "metabase/components/SidebarItem";

const BaseSidebar = ({ style, className }) => (
  <div className={cx(S.sidebar, className)} style={style}>
    <div className={S.breadcrumbs}>
      <Breadcrumbs
        className="py4 ml3"
        crumbs={[[t`Data Reference`]]}
        inSidebar={true}
        placeholder={t`Data Reference`}
      />
    </div>
    <ol className="mx3">
      <SidebarItem
        key="/reference/metrics"
        href="/reference/metrics"
        icon="ruler"
        name={t`Metrics`}
      />
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
    </ol>
  </div>
);

BaseSidebar.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
};

export default memo(BaseSidebar);
