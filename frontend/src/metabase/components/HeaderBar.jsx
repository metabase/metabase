import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";
import TitleAndDescription from "metabase/components/TitleAndDescription.jsx";


export default class Header extends Component {

    static defaultProps = {
        buttons: null,
        className: "py1 lg-py2 xl-py3 wrapper",
        breadcrumb: null
    };

    render() {
        const { isEditing, name, description, breadcrumb, buttons, className } = this.props;

        let titleAndDescription;
        if (isEditing) {
            titleAndDescription = (
                <div className="Header-title flex flex-column flex-full bordered rounded my1">
                    <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={name} onChange={(e) => this.props.setItemAttributeFn("name", e.target.value)} />
                    <Input className="AdminInput rounded-bottom h4" type="text" value={description} onChange={(e) => this.props.setItemAttributeFn("description", e.target.value)} placeholder="No description yet" />
                </div>
            );
        } else {
            if (name && description) {
                titleAndDescription = (
                    <TitleAndDescription
                        title={name} 
                        description={description}
                    />
                );
            } else {
                titleAndDescription = (
                    <div className="flex align-baseline">
                        <h1 className="Header-title-name my1">{name}</h1> {breadcrumb}
                    </div>
                );
            }
        }

        return (
            <div className={"QueryBuilder-section flex align-center " + className}>
                <div className="Entity py1">
                    {titleAndDescription}
                </div>

                <div className="flex-align-right">
                    {buttons}
                </div>
            </div>
        );
    }
}
