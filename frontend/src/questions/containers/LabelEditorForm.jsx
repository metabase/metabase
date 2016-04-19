/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import S from "./LabelEditorForm.css";

import LabelIconPicker from "../components/LabelIconPicker.jsx";

import { reduxForm } from "redux-form";

import cx from "classnames";
import _ from "underscore";

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
            <form className={cx(className, S.form)} onSubmit={handleSubmit}>
                <LabelIconPicker {...icon} />
                <div className={S.nameContainer}>
                    <input className={cx(S.nameInput, "input", { [S.invalid]: nameInvalid })} type="text" placeholder="Name" {...name}/>
                    { errorMessage && <div className={S.errorMessage}>{errorMessage}</div> }
                </div>
                <button className={cx("Button", { "disabled": invalid, "Button--primary": !invalid })} type="submit">{submitButtonText}</button>
            </form>
        );
    }
}
