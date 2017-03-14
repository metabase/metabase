import React, { Component, PropTypes } from "react";

import { MODAL_CHILD_CONTEXT_TYPES } from "./Modal";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

import "./ModalContent.css";

export default class ModalContent extends Component {
    static propTypes = {
        id: PropTypes.string,
        title: PropTypes.string,
        onClose: PropTypes.func.isRequired
    };

    static defaultProps = {
    };

    static contextTypes = MODAL_CHILD_CONTEXT_TYPES;

    render() {
        const { title, footer, onClose, children, className } = this.props;

        const { fullPageModal, formModal } = this.context;
        return (
            <div
                id={this.props.id}
                className={cx("ModalContent NewForm flex-full flex flex-column relative", className, { "full-height": fullPageModal && !formModal })}
            >
                { onClose &&
                    <Icon
                        className="text-grey-2 text-grey-4-hover cursor-pointer absolute m2 p2 top right"
                        name="close"
                        size={fullPageModal ? 24 : 16}
                        onClick={onClose}
                    />
                }
                { title &&
                    <ModalHeader>
                        {title}
                    </ModalHeader>
                }
                <ModalBody>
                    {children}
                </ModalBody>
                { footer &&
                    <ModalFooter>
                        {footer}
                    </ModalFooter>
                }
            </div>
        );
    }
}

const FORM_WIDTH = 500 + 32 * 2; // includes padding

export const ModalHeader = ({ children }, { fullPageModal, formModal }) =>
    <div className={cx("ModalHeader flex-no-shrink px4 py4 full")}>
        <h2 className={cx("text-bold", { "text-centered": fullPageModal }, { "mr4": !fullPageModal})}>{children}</h2>
    </div>

ModalHeader.contextTypes = MODAL_CHILD_CONTEXT_TYPES;

export const ModalBody = ({ children }, { fullPageModal, formModal }) =>
    <div
        className={cx("ModalBody", { "px4": formModal, "flex flex-full": !formModal })}
    >
        <div
            className="flex-full ml-auto mr-auto flex flex-column"
            style={{ maxWidth: (formModal && fullPageModal) ? FORM_WIDTH : undefined }}
        >
            {children}
        </div>
    </div>

ModalBody.contextTypes = MODAL_CHILD_CONTEXT_TYPES;

export const ModalFooter = ({ children }, { fullPageModal, formModal }) =>
    <div
        className={cx("ModalFooter flex-no-shrink px4", fullPageModal ? "py4" : "py2", {
            "border-top": !fullPageModal || (fullPageModal && !formModal),
        })}
    >
        <div
            className="flex-full ml-auto mr-auto flex"
            style={{ maxWidth: (formModal && fullPageModal) ? FORM_WIDTH : undefined }}
        >
            <div className="flex-full" />
            { Array.isArray(children) ?
                children.map((child, index) => <span key={index} className="ml2">{child}</span>)
            :
                children
            }
        </div>
    </div>

ModalFooter.contextTypes = MODAL_CHILD_CONTEXT_TYPES;
