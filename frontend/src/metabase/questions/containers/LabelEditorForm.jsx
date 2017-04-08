/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import S from "./LabelEditorForm.css";

import LabelIconPicker from "../components/LabelIconPicker.jsx";

import { reduxForm } from "redux-form";

import cx from "classnames";

@reduxForm({
    form: 'label',
    fields: ['icon', 'name', 'id'],
    validate: (values) => {
        const errors = {};
        if (!values.name) {
            errors.name = true;
        }
        if (!values.icon) {
            errors.icon = "Icon is required";
        }
        return errors;
    }
})
export default class LabelEditorForm extends Component {
    static propTypes = {
        className:          PropTypes.string,
        fields:             PropTypes.object.isRequired,
        invalid:            PropTypes.bool.isRequired,
        error:              PropTypes.any,
        submitButtonText:   PropTypes.string.isRequired,
        handleSubmit:       PropTypes.func.isRequired,
    };

    render() {
        const { fields: { icon, name }, error, handleSubmit, invalid, className, submitButtonText } = this.props;
        const nameInvalid = name.invalid && ((name.active && name.value) || (!name.active && name.visited));
        const errorMessage = name.error || error;
        return (
            <form className={className} onSubmit={handleSubmit}>
                <div className="flex">
                    <LabelIconPicker {...icon} />
                    <div className="full">
                        <div className="flex">
                          <input className={cx(S.nameInput, "input", { [S.invalid]: nameInvalid })} type="text" placeholder="Name" {...name}/>
                          <button className={cx("Button", "ml1", { "disabled": invalid, "Button--primary": !invalid })} type="submit">{submitButtonText}</button>
                        </div>
                        { nameInvalid && errorMessage && <div className={S.errorMessage}>{errorMessage}</div> }
                    </div>
                </div>
            </form>
        );
    }
}
