import React, { Component, PropTypes } from "react";

import FormLabel from "../components/FormLabel.jsx";
import FormInput from "../components/FormInput.jsx";
import FormTextArea from "../components/FormTextArea.jsx";
import FieldSet from "../components/FieldSet.jsx";
import PartialQueryBuilder from "../components/PartialQueryBuilder.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { formatScalar } from "metabase/lib/formatting";

import { metricFormSelectors } from "../selectors";
import { reduxForm } from "redux-form";

import cx from "classnames";

@reduxForm({
    form: "metric",
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
        if (!values.definition || !values.definition.filter || !values.definition.aggregation || values.definition.aggregation[0] == null) {
            errors.definition = "Aggreagtion is required";
        }
        return errors;
    }
},
metricFormSelectors)
export default class MetricForm extends Component {
    updatePreviewSummary(query) {
        this.props.updatePreviewSummary({
            ...query,
            query: {
                aggregation: ["count"],
                ...query.query,
            }
        })
    }

    renderActionButtons() {
        const { invalid, handleSubmit, tableMetadata } = this.props;
        return (
            <div>
                <button className={cx("Button", { "Button--primary": !invalid, "disabled": invalid })} onClick={handleSubmit}>Save changes</button>
                <a className="Button Button--borderless mx1" href={"/admin/datamodel/database/" + tableMetadata.db_id + "/table/" + tableMetadata.id}>Cancel</a>
            </div>
        )
    }

    render() {
        const { fields: { id, name, description, definition, revision_message }, metric, tableMetadata, handleSubmit, previewSummary } = this.props;

        return (
            <LoadingAndErrorWrapper loading={!tableMetadata}>
            { () =>
                <form onSubmit={handleSubmit}>
                    <div className="wrapper py4">
                        <FormLabel
                            title={(metric && metric.id != null ? "Edit" : "Create") + " Your Metric"}
                            description={metric && metric.id != null ?
                                "Make changes to your metric and leave an explanatory note." :
                                "You can create saved metrics to add a named metric option to this table. Saved metrics include the aggregation type, the aggregated field, and optionally any filter you add. As an example, you might use this to create something like the official way of calculating \"Average Price\" for an Orders table."
                            }
                        >
                        <PartialQueryBuilder
                            features={{
                                filter: true,
                                aggregation: true
                            }}
                            tableMetadata={{
                                ...tableMetadata,
                                aggregation_options: tableMetadata.aggregation_options.filter(a => a.short !== "rows"),
                                metrics: null
                            }}
                            previewSummary={previewSummary == null ? "" : "Result: " + formatScalar(previewSummary)}
                            updatePreviewSummary={this.updatePreviewSummary.bind(this)}
                            {...definition}
                        />
                        </FormLabel>
                        <div style={{ maxWidth: "575px" }}>
                            <FormLabel
                                title="Name Your Metric"
                                description="Give your metric a name to help others find it."
                            >
                                <FormInput
                                    field={name}
                                    placeholder="Something descriptive but not too long"
                                />
                            </FormLabel>
                            <FormLabel
                                title="Describe Your Metric"
                                description="Give your metric a description to help others understand what it's about."
                            >
                                <FormTextArea
                                    field={description}
                                    placeholder="This is a good place to be more specific about less obvious metric rules"
                                />
                            </FormLabel>
                            { id.value != null &&
                                <FieldSet legend="Reason For Changes">
                                    <FormLabel description="Leave a note to explain what changes you made and why they were required.">
                                        <FormTextArea
                                            field={revision_message}
                                            placeholder="This will show up in the revision history for this metric to help everyone remember why things changed"
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
                        <div  className="border-top wrapper py4">
                            {this.renderActionButtons()}
                        </div>
                    }
                </form>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
