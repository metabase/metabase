import React, { Component } from "react";
import PropTypes from "prop-types";

import ModalContent from "metabase/components/ModalContent.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import cx from "classnames";
import _ from "underscore";

export default class DeleteModalWithConfirm extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            checked: {}
        };

        _.bindAll(this, "onDelete");
    }

    static propTypes = {
        objectName: PropTypes.string.isRequired,
        objectType: PropTypes.string.isRequired,
        confirmItems: PropTypes.array.isRequired,
        onClose: PropTypes.func.isRequired,
        onDelete: PropTypes.func.isRequired,
    };

    async onDelete() {
        await this.props.onDelete();
        this.props.onClose();
    }

    render() {
        const { objectName, objectType, confirmItems } = this.props;
        const { checked } = this.state;
        let confirmed = confirmItems.reduce((acc, item, index) => acc && checked[index], true);
        return (
            <ModalContent
                title={"Delete \"" + objectName + "\"?"}
                onClose={this.props.onClose}
            >
            <div className="px4 pb4">
                <ul>
                    {confirmItems.map((item, index) =>
                        <li key={index} className="pb2 mb2 border-row-divider flex align-center">
                            <span className="text-error">
                                <CheckBox
                                    checkColor="currentColor" borderColor={checked[index] ? "currentColor" : undefined} size={20}
                                    checked={checked[index]}
                                    onChange={(e) => this.setState({ checked: { ...checked, [index]: e.target.checked } })}
                                />
                            </span>
                            <span className="ml2 h4">{item}</span>
                        </li>
                    )}
                </ul>
                <button
                    className={cx("Button", { disabled: !confirmed, "Button--danger": confirmed })}
                    onClick={this.onDelete}
                >
                    Delete this {objectType}
                </button>
            </div>
            </ModalContent>
        );
    }
}
