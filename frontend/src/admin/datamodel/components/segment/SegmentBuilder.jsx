import React, { Component, PropTypes } from "react";

import GuiQueryEditor from "metabase/query_builder/GuiQueryEditor.jsx";

import { serializeCardForUrl } from "metabase/lib/card";
import { formatScalar } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class SegmentBuilder extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};

        _.bindAll(this, "setQuery");
    }

    static propTypes = {
        onChange: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        updateResultCount: PropTypes.func.isRequired,
        resultCount: PropTypes.number
    };

    componentDidMount() {
        const { value, tableMetadata } = this.props;
        this.props.updateResultCount({
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
        this.props.updateResultCount(query);
    }

    render() {
        let { value, tableMetadata, resultCount } = this.props;

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
        let previewUrl = "/q/" + serializeCardForUrl(previewCard);

        return (
            <div className="py1">
                <GuiQueryEditor
                    query={dataset_query}
                    features={{
                        filter: true
                    }}
                    tableMetadata={tableMetadata}
                    setQueryFn={this.setQuery}
                >
                    <div className="flex align-center mx2 my2">
                        {resultCount != null && <span className="text-bold px3">Results: {formatScalar(resultCount)}</span>}
                        <a target="_blank" className={cx("Button Button--primary")} href={previewUrl}>Preview</a>
                    </div>
                </GuiQueryEditor>
            </div>
        );
    }
}
