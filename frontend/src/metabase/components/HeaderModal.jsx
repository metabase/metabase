import React, { Component, PropTypes } from "react";

import BodyComponent from "metabase/components/BodyComponent";
import cx from "classnames";

@BodyComponent
export default class HeaderModal extends Component {
    render() {
        const { className, height, title, onDone, onCancel } = this.props;
        return (
            <div className={cx(className, "absolute top left right bg-brand flex flex-column layout-centered")} style={{ zIndex: 2, height: height }}>
                    <h2 className="text-white pb2">{title}</h2>
                    <div className="flex layout-centered">
                        <button className="Button Button--borderless text-brand bg-white text-bold" onClick={onDone}>Done</button>
                        { onCancel && <span className="text-white mx1">or</span> }
                        { onCancel && <a className="cursor-pointer text-white text-bold" onClick={onCancel}>Cancel</a> }
                    </div>
            </div>
        );
    }
}
