import React, { Component, PropTypes } from "react";

import FormLabel from "../components/FormLabel.jsx";
import FormInput from "../components/FormInput.jsx";
import FormTextArea from "../components/FormTextArea.jsx";
import Fieldset from "../components/FieldSet.jsx";
import SegmentBuilder from "../components/segment/SegmentBuilder.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { segmentFormSelectors } from "../selectors";
import { reduxForm } from "redux-form";

import cx from "classnames";

@reduxForm({
    form: "segment",
    fields: ["id", "name", "description", "table_id", "definition", "revision_message"],
    validate: (values) => {
        const errors = {};
        if (!values.name) {
            errors.name = "Name is required";
        }
        if (!values.description) {
            errors.description = "Description is required";
        }
        if (values.id != null) {
            if (!values.revision_message) {
                errors.revision_message = "Revision message is required";
            }
        }
        if (!values.definition || !values.definition.filter || values.definition.filter.length < 1) {
            errors.definition = "At least one filter is required";
        }
        return errors;
    },
    initialValues: { name: "", description: "", table_id: null, definition: { filter: [] }, revision_message: null }
},
segmentFormSelectors)
export default class SegmentForm extends Component {
    render() {
        const { fields: { id, name, description, definition, revision_message }, invalid, handleSubmit, segment, tableMetadata } = this.props;
        return (
            <LoadingAndErrorWrapper loading={!tableMetadata}>
            { () =>
                <form onSubmit={handleSubmit}>
                    <div className="p4">
                        <FormLabel
                            title={(segment && segment.id != null ? "Edit" : "Create") + " Your Segment"}
                            description={"Select and add filters to create your new segment for the " + tableMetadata.display_name + " table"}
                        >
                            <SegmentBuilder
                                tableMetadata={tableMetadata}
                                updateResultCount={this.props.updateResultCount}
                                resultCount={this.props.resultCount}
                                {...definition}
                            />
                        </FormLabel>
                        <div style={{ maxWidth: "575px" }}>
                            <FormLabel
                                title="Name Your Segment"
                                description="Give your segment a name to help others find it."
                            >
                                <FormInput
                                    field={name}
                                    placeholder="Something descriptive but not too long"
                                />
                            </FormLabel>
                            <FormLabel
                                title="Describe Your Segment"
                                description="Give your segment a description to help others understand what it's about."
                            >
                                <FormTextArea
                                    field={description}
                                    placeholder="This is a good place to be more specific about less obvious segment rules"
                                />
                            </FormLabel>
                            { id.value != null &&
                                <Fieldset legend="Reason For Changes">
                                    <FormLabel description="Leave a note to explain what changes you made and why they were required.">
                                        <FormTextArea
                                            field={revision_message}
                                            placeholder="This will show up in the revision history for this segment to help everyone remember why things changed"
                                        />
                                    </FormLabel>
                                    <div className="flex align-center">
                                        <button className={cx("Button", { "Button--primary": !invalid, "disabled": invalid })} onClick={handleSubmit}>Save changes</button>
                                        <a className="Button Button--borderless mx1" href={"/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id}>Cancel</a>
                                    </div>
                                </Fieldset>
                            }
                        </div>
                    </div>

                    { id.value == null &&
                        <div  className="border-top p4">
                            <button className={cx("Button", { "Button--primary": !invalid, "disabled": invalid })} onClick={handleSubmit}>Save</button>
                        </div>
                    }
                </form>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
