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

        const children = [];
        // TODO: maybe refactor this a bit to make it clearer how to use?
        for (let [index, crumb] of crumbs.entries()) {
            crumb = Array.isArray(crumb) ? crumb : [crumb];
            if (crumb.length > 1) {
                children.push(
                    // TODO: ideally tooltips should only show when element overflows
                    // but I can't seem to figure out how to actually implement it in React
                    <Tooltip tooltip={crumb[0]}>
                        <a
                            className={cx(breadcrumbClass, S.breadcrumbPath)}
                            href={crumb[1]}
                            >
                            {crumb[0]}
                        </a>
                    </Tooltip>
                );
            } else {
                children.push(
                    <Tooltip tooltip={crumb[0]}>
                        <h2 className={cx(breadcrumbClass, S.breadcrumbPage)}>
                            {crumb}
                        </h2>
                    </Tooltip>

                );
            }
            if (index < crumbs.length - 1) {
                children.push(<Icon name="chevronright" className={S.breadcrumbDivider} width={12} height={12} />);
            }
        }

        return (
            <section className={breadcrumbsClass}>
                {children}
            </section>
        );
    }
}
