import React, { Component } from "react";
import { reduxForm } from "redux-form";

import Button from "metabase/components/Button";
import FormField from "metabase/components/FormField";
import Input from "metabase/components/Input";
import Modal from "metabase/components/Modal";

const formConfig = {
    form: '${object_name}',
    fields: ['id', 'name', 'description'],
    validate: (values) => {
        const errors = {};
        if (!values.name) {
            errors.name = "Name is required";
        }
        return errors;
    },
    initialValues: {
        id: null,
        name: "",
        description: "",
    }
}

export const getFormTitle = ({ id, name }) =>
    id.value != null ? name.value : "New ${object_name}"

export const getActionText = ({ id }) =>
    id.value != null ? "Update": "Create"

export class ${ObjectName}Form extends Component {
    props: {
        fields: Object,
        onClose: Function,
        invalid: Boolean,
        handleSubmit: Function,
    }

    render() {
        const { fields, onClose } = this.props;
        return (
            <Modal
                inline
                form
                title={getFormTitle(fields)}
                footer={<${ObjectName}FormActions {...this.props} />}
                onClose={onClose}
            >
                <div className="NewForm ml-auto mr-auto mt4 pt2" style={{ width: 540 }}>
                    <FormField
                        displayName="Name"
                        {...fields.name}
                    >
                        <Input
                            className="Form-input full"
                            placeholder="My new fantastic ${object_name}"
                            autoFocus
                            {...fields.name}
                        />
                    </FormField>
                    <FormField
                        displayName="Description"
                        {...fields.description}
                    >
                        <textarea
                            className="Form-input full"
                            placeholder="It's optional but oh, so helpful"
                            {...fields.description}
                        />
                    </FormField>
                </div>
            </Modal>
        )
    }
}

export const ${ObjectName}FormActions = ({ handleSubmit, invalid, onClose, fields}) =>
    <div>
        <Button className="mr1" onClick={onClose}>
            Cancel
        </Button>
        <Button primary disabled={invalid} onClick={handleSubmit}>
            { getActionText(fields) }
        </Button>
    </div>

export default reduxForm(formConfig)(${ObjectName}Form)
