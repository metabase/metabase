import React, { Component } from "react";

import Button from "metabase/components/Button";
import ColorPicker from "metabase/components/ColorPicker";
import FormField from "metabase/components/FormField";
import Input from "metabase/components/Input";
import Modal from "metabase/components/Modal";

import { reduxForm } from "redux-form";

import { normal } from "metabase/lib/colors";

@reduxForm({
    form: 'collection',
    fields: ['id', 'name', 'description', 'color'],
    validate: (values) => {
        const errors = {};
        if (!values.name) {
            errors.name = "Name is required";
        } else if (values.name.length > 100) {
            errors.name = "Name must be 100 characters or less";
        }
        if (!values.color) {
            errors.color = "Color is required";
        }
        return errors;
    },
    initialValues: {
        name: "",
        description: "",
        // pick a random color to start so everything isn't blue all the time
        color: normal[Math.floor(Math.random() * normal.length)]
    }
})
export default class CollectionEditorForm extends Component {
    render() {
        const { fields, handleSubmit, invalid, onClose } = this.props;
        return (
            <Modal
                inline
                form
                title={fields.id.value != null ? fields.name.value : "New collection"}
                footer={[
                    <Button className="mr1" onClick={onClose}>
                        Cancel
                    </Button>,
                    <Button primary disabled={invalid} onClick={handleSubmit}>
                        { fields.id.value != null ? "Update" : "Create" }
                    </Button>
                ]}
                onClose={onClose}
            >
                <div className="NewForm ml-auto mr-auto mt4 pt2" style={{ width: 540 }}>
                    <FormField
                        displayName="Name"
                        {...fields.name}
                    >
                        <Input
                            className="Form-input full"
                            placeholder="My new fantastic collection"
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
                    <FormField
                        displayName="Color"
                        {...fields.color}
                    >
                        <ColorPicker {...fields.color} />
                    </FormField>
                </div>
            </Modal>
        )
    }
}
