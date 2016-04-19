/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import S from "./LabelEditorForm.css";

import LabelIconPicker from "../components/LabelIconPicker.jsx";

import { reduxForm } from "redux-form";

import { slugify } from "metabase/lib/formatting";

import cx from "classnames";
import _ from "underscore";

@reduxForm({
    form: 'label',
    fields: ['icon', 'name', 'id'],
    validate: (values, props) => {
        const errors = {};
        if (!values.name) {
            errors.name = "Name is required";
        } else if (_.findWhere(props.labels, { slug: slugify(values.name) })) {
            errors.name = "Name must be unique";
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
        submitButtonText:   PropTypes.string.isRequired,
        handleSubmit:       PropTypes.func.isRequired,
        labels:             PropTypes.array.isRequired,
    };

    render() {
        const { fields: { icon, name }, handleSubmit, invalid, className, submitButtonText } = this.props;
        const nameInvalid = name.invalid && ((name.active && name.value) || (!name.active && name.visited));
        return (
            <form className={cx(className, S.form)} onSubmit={handleSubmit}>
                <LabelIconPicker {...icon} />
                <input className={cx(S.nameInput, "input", { [S.invalid]: nameInvalid })} type="text" placeholder="Name" {...name}/>
                <button className={cx("Button", { "disabled": invalid, "Button--primary": !invalid })} type="submit">{submitButtonText}</button>
            </form>
        );
    }
}
