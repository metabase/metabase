/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "metabase/components/Sidebar.css";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import SidebarItem from "metabase/components/SidebarItem.jsx"

import cx from 'classnames';
import pure from "recompose/pure";

const SegmentFieldSidebar = ({
    segment,
    field,
    style,
    className
}) =>
    <div className={cx(S.sidebar, className)} style={style}>
        <ul>
            <div className={S.breadcrumbs}>
                <Breadcrumbs
                    className="py4"
                    crumbs={[["Segments","/reference/segments"],
                             [segment.name, `/reference/segments/${segment.id}`],
                             [field.name]]}
                    inSidebar={true}
                    placeholder="Data Reference"
                />
            </div>
                <SidebarItem key={`/reference/segments/${segment.id}/fields/${field.id}`} 
                             href={`/reference/segments/${segment.id}/fields/${field.id}`} 
                             icon="document" 
                             name="Details" />
        </ul>
    </div>

SegmentFieldSidebar.propTypes = {
    segment:          PropTypes.object,
    field:          PropTypes.object,
    className:      PropTypes.string,
    style:          PropTypes.object,
};

export default pure(SegmentFieldSidebar);

