import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx"

export default class Breadcrumbs extends Component {
    static propTypes = {
        crumbs: PropTypes.array
    };
    static defaultProps = {
        crumbs: []
    };

    render() {
        const children = [];
        for (let [index, crumb] of this.props.crumbs.entries()) {
            crumb = Array.isArray(crumb) ? crumb : [crumb];
            if (crumb.length > 1) {
                children.push(<a className="Breadcrumb Breadcrumb--path" href={crumb[1]}>{crumb[0]}</a>);
            } else {
                children.push(<h2 className="Breadcrumb Breadcrumb--page">{crumb}</h2>);
            }
            if (index < this.props.crumbs.length - 1) {
                children.push(<Icon name="chevronright" className="Breadcrumb-divider" width={12} height={12} />);
            }
        }
        return (
            <section className="Breadcrumbs">
                {children}
            </section>
        );
    }
}
