import React, { Component } from "react";
import { Link } from "react-router";

import FormLabel from "../components/FormLabel.jsx";
import FormInput from "../components/FormInput.jsx";
import FormTextArea from "../components/FormTextArea.jsx";
import FieldSet from "metabase/components/FieldSet.jsx";
import PartialQueryBuilder from "../components/PartialQueryBuilder.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { formatValue } from "metabase/lib/formatting";

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
(state, props) => segmentFormSelectors(state, props))
export default class SegmentForm extends Component {
    updatePreviewSummary(datasetQuery) {
        this.props.updatePreviewSummary({
            ...datasetQuery,
            query: {
                ...datasetQuery.query,
                aggregation: ["count"]
            }
        })
    }

    renderActionButtons() {
        const { invalid, handleSubmit, tableMetadata } = this.props;
        return (
            <div>
                <button className={cx("Button", { "Button--primary": !invalid, "disabled": invalid })} onClick={handleSubmit}>Save changes</button>
                <Link to={"/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id} className="Button Button--borderless mx1">Cancel</Link>
            </div>
        )
    }

    render() {
        const { fields: { id, name, description, definition, revision_message }, segment, tableMetadata, handleSubmit, previewSummary } = this.props;

        return (
            <LoadingAndErrorWrapper loading={!tableMetadata}>
            { () =>
                <form className="full" onSubmit={handleSubmit}>
                    <div className="wrapper py4">
                        <FormLabel
                            title={(segment && segment.id != null ? "Edit" : "Create") + " Your Segment"}
                            description={segment && segment.id != null ?
                                "Make changes to your segment and leave an explanatory note." :
                                "Select and add filters to create your new segment for the " + tableMetadata.display_name + " table"
                            }
                        >
                            <PartialQueryBuilder
                                features={{
                                    filter: true
                                }}
                                tableMetadata={{
                                    ...tableMetadata,
                                    segments: null
                                }}
                                previewSummary={previewSummary == null ? "" : formatValue(previewSummary) + " rows"}
                                updatePreviewSummary={this.updatePreviewSummary.bind(this)}
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
                                <FieldSet legend="Reason For Changes">
                                    <FormLabel description="Leave a note to explain what changes you made and why they were required.">
                                        <FormTextArea
                                            field={revision_message}
                                            placeholder="This will show up in the revision history for this segment to help everyone remember why things changed"
                                        />
                                    </FormLabel>
                                    <div className="flex align-center">
                                        {this.renderActionButtons()}
                                    </div>
                                </FieldSet>
                            }
                        </div>
                    </div>

                    { id.value == null &&
                        <div className="border-top py4">
                            <div className="wrapper">
                                {this.renderActionButtons()}
                            </div>
                        </div>
                    }
                </form>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
