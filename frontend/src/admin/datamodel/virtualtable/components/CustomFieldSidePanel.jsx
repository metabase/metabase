import React, { Component, PropTypes } from "react";
import cx from "classnames";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import ExpressionInput from "./ExpressionInput.jsx";


export default class CustomFieldSidePanel extends Component {
    static propTypes = {
        expression: PropTypes.string,
        display_name: PropTypes.string,
        onDelete: PropTypes.func,
        onSave: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired,
    };

    static defaultProps = {
        expression: null,
        display_name: null
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            showDeleteConfirmModal: false,
            expression: props.expression || null,
            display_name: props.display_name || null
        };
    }

    isValid() {
        const { expression, display_name } = this.state;
        return display_name && !_.isEmpty(display_name.trim()) && expression && !_.isEmpty(expression);
    }

    onSave() {
        if (this.isValid()) {
            this.props.onSave({
                expression: this.state.expression,
                display_name: this.state.display_name.trim()
            });
        }
    }

    onDelete() {
        this.props.onDelete();
        this.setState({showDeleteConfirmModal: false});
    }

    render() {
        const { metadata, onDelete, onCancel } = this.props;
        const { expression, display_name } = this.state;

        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div style={{flexGrow: "1"}} className="p2">
                	<h5 className="text-uppercase text-grey-4 pb1">Field Formula</h5>
                	<ExpressionInput
                        onBlur={(expression) => this.setState({expression: expression})}
                        autoFocus={true}
                    />
                    <div className="py2">
                    	Think of this as being kind of like writing a formula in a spreadsheet program: 
                    	you can use numbers, fields in this table, mathmatic symbols like +, and some functions.  
                    	So you could type, Subtotal - Cost.
                    	<a className="link block">Learn more</a>
                    </div>

                    <h5 className="text-uppercase text-grey-4 pb1 pt2">Name your field</h5>
                    <input
                        className={cx("input block full")}
                        type="text"
                        value={display_name}
                        onChange={(e) => this.setState({display_name: e.target.value})}
                        placeholder={"You can change this whenever"}
                    />

                    { onDelete && 
                        <div>
                            <h5 className="text-uppercase text-grey-4 pb1 pt2">Danger zone</h5>
                            <a className="link text-danger" onClick={() => this.setState({showDeleteConfirmModal: true})}>Delete this field</a>
                            <Modal className="Modal Modal--small">
                                <ModalContent title={"Delete this custom field?"}
                                              closeFn={() => this.setState({showDeleteConfirmModal: false})}
                                              className="Modal-content Modal-content--small NewForm">
                                    <div>
                                        <div className="px4 pb4">
                                            <span className="text-bold">{display_name}</span> will be permanently removed from the table.
                                        </div>

                                        <div className="Form-actions">
                                            <button className="Button Button--warning" type="button" onClick={this.onDelete.bind(this)}>Yes</button>
                                            <button className="Button Button--primary ml2" type="button" onClick={() => this.setState({showDeleteConfirmModal: false})}>No</button>
                                        </div>
                                    </div>
                                </ModalContent>
                            </Modal>
                        </div>
                    }
                </div>

                <div className="p1 border-top">
	            	<button className={cx("Button px4", {"Button--primary": this.isValid()})} type="button" disabled={!this.isValid()} onClick={this.onSave.bind(this)}>{ onDelete ? "Save Changes" : "Add Field"}</button>
	            	<span className="px1">or</span>
	            	<a className="link text-bold" onClick={() => this.props.onCancel()}>Cancel</a>
	            </div>
            </div>
        );
    }
}
