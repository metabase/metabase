import React, { Component, PropTypes } from "react";

import S from "./Breadcrumbs.css";

import Icon from "metabase/components/Icon.jsx";

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
                    <a
                        className={cx(breadcrumbClass, S.breadcrumbPath)}
                        href={crumb[1]}
                    >
                        {crumb[0]}
                    </a>
                );
            } else {
                children.push(
                    <h2
                        className={cx(breadcrumbClass, S.breadcrumbPage)}
                    >
                        {crumb}
                    </h2>);
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
