/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx"

import cx from 'classnames';
import pure from "recompose/pure";

const MetricSidebar = ({
    metric,
    user,
    style,
    className
}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            <div className={S.breadcrumbs}>
                <Breadcrumbs
                    className="py4"
                    crumbs={[["Metrics","/reference/metrics"],
                             [metric.name]]}
                    inSidebar={true}
                    placeholder="Data Reference"
                />
            </div>
                <SidebarItem key={`/reference/metrics/${metric.id}`} 
                             href={`/reference/metrics/${metric.id}`} 
                             icon="document" 
                             name="Details" />
                <SidebarItem key={`/reference/metrics/${metric.id}/questions`} 
                             href={`/reference/metrics/${metric.id}/questions`} 
                             icon="all" 
                             name={`Questions about ${metric.name}`} />
             { user && user.is_superuser &&

                <SidebarItem key={`/reference/metrics/${metric.id}/revisions`}
                             href={`/reference/metrics/${metric.id}/revisions`}
                             icon="history" 
                             name={`Revision history for ${metric.name}`} />
             }
        </ul>
    </div>

MetricSidebar.propTypes = {
    metric:          PropTypes.object,
    user:          PropTypes.object,
    className:      PropTypes.string,
    style:          PropTypes.object,
};

export default pure(MetricSidebar);

