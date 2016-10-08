import React, { Component, PropTypes } from "react";

import GuiQueryEditor from "metabase/query_builder/GuiQueryEditor.jsx";

import { serializeCardForUrl } from "metabase/lib/card";

import _ from "underscore";
import cx from "classnames";

export default class PartialQueryBuilder extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};

        _.bindAll(this, "setQuery");
    }

    static propTypes = {
        onChange: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        updatePreviewSummary: PropTypes.func.isRequired,
        previewSummary: PropTypes.string
    };

    componentDidMount() {
        const { value, tableMetadata } = this.props;
        this.props.updatePreviewSummary({
            type: "query",
            database: tableMetadata.db_id,
            query: {
                ...value,
                source_table: tableMetadata.id
            }
        });
    }

    setQuery(query) {
        this.props.onChange(query.query);
        this.props.updatePreviewSummary(query);
    }

    render() {
        let { features, value, tableMetadata, previewSummary } = this.props;

        let dataset_query = {
            type: "query",
            database: tableMetadata.db_id,
            query: {
                ...value,
                source_table: tableMetadata.id
            }
        };

        let previewCard = {
            dataset_query: {
                ...dataset_query,
                query: {
                    aggregation: ["rows"],
                    breakout: [],
                    filter: [],
                    ...dataset_query.query
                }
            }
        };
        let previewUrl = "/q#" + serializeCardForUrl(previewCard);

        return (
            <div className="py1">
                <GuiQueryEditor
                    query={dataset_query}
                    features={features}
                    tableMetadata={tableMetadata}
                    setQueryFn={this.setQuery}
                    isShowingDataReference={false}
                    setDatabaseFn={null}
                    setSourceTableFn={null}
                >
                    <div className="flex align-center mx2 my2">
                        <span className="text-bold px3">{previewSummary}</span>
                        <a data-metabase-event={"Data Model;Preview Click"} target={window.OSX ? null : "_blank"} className={cx("Button Button--primary")} href={previewUrl}>Preview</a>
                    </div>
                </GuiQueryEditor>
            </div>
        );
    }
}
