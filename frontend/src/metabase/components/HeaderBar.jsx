/* @flow */
import React, { Component } from "react";
import cx from "classnames";

import Input from "metabase/components/Input.jsx";
import TitleAndDescription from "metabase/components/TitleAndDescription.jsx";

export default class HeaderBar extends Component {

    static defaultProps = {
        buttons: null,
    };

    render() {
        const { isEditing, name, description, buttons, badge } = this.props;

        return (
            <div className="wrapper sm-py3 flex align-center">
                <div className="flex-full">
                    { isEditing
                            ? (
                                <div className="Header-title flex flex-column flex-full bordered rounded my1">
                                    <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={name} onChange={(e) => this.props.setItemAttributeFn("name", e.target.value)} />
                                    <Input className="AdminInput rounded-bottom h4" type="text" value={description} onChange={(e) => this.props.setItemAttributeFn("description", e.target.value)} placeholder="No description yet" />
                                </div>

                            )
                            : (
                                <div className="sm-ml1">
                                    { badge && <span className="mb2">{badge}</span>}
                                    <TitleAndDescription
                                        title={name}
                                        description={description}
                                    />
                                </div>
                            )
                    }
                </div>

                <div className="flex-align-right hide sm-show">
                    {buttons}
                </div>
            </div>
        );
    }
}
