import React, { Component, PropTypes } from "react";

import S from "./Breadcrumbs.css";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import cx from 'classnames';

export default class Breadcrumbs extends Component {
    static propTypes = {
        crumbs: PropTypes.array,
        inSidebar: PropTypes.bool
    };
    static defaultProps = {
        crumbs: [],
        inSidebar: false
    };

    render() {
        const {
            crumbs,
            inSidebar
        } = this.props;

        const breadcrumbClass = inSidebar ? S.sidebarBreadcrumb : S.breadcrumb;
        const breadcrumbsClass = inSidebar ? S.sidebarBreadcrumbs : S.breadcrumbs;

        return (
            <section className={breadcrumbsClass}>
                { crumbs
                    .map(breadcrumb => Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb])
                    .map((breadcrumb, index) => breadcrumb.length > 1 ?
                        // TODO: ideally tooltips should only show when element overflows
                        // but I can't seem to figure out how to actually implement it in React
                        <Tooltip key={index} tooltip={breadcrumb[0]}>
                            <a
                                className={cx(breadcrumbClass, S.breadcrumbPath)}
                                href={breadcrumb[1]}
                                >
                                {breadcrumb[0]}
                            </a>
                        </Tooltip> :
                        <Tooltip key={index} tooltip={breadcrumb[0]}>
                            <h2 className={cx(breadcrumbClass, S.breadcrumbPage)}>
                                {breadcrumb}
                            </h2>
                        </Tooltip>
                    )
                    .map((breadcrumb, index, breadcrumbs) => index < breadcrumbs.length - 1 ?
                        [
                            breadcrumb,
                            <Icon
                                key={`${index}-separator`}
                                name="chevronright"
                                className={S.breadcrumbDivider}
                                width={12}
                                height={12}
                            />
                        ] :
                        breadcrumb
                    )
                }
            </section>
        );
    }
}
