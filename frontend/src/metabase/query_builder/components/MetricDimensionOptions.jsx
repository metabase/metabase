/* @flow */
import React, { Component } from "react";
import Select, { Option } from "metabase/components/Select";
import MultiQuery from "metabase-lib/lib/queries/MultiQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension, { DatetimeFieldDimension, FieldIDDimension } from "metabase-lib/lib/Dimension";
import MetricWidget from "metabase/query_builder/components/MetricWidget";

type UpdateDimensionParams = {
    index: number,
    updatedDimension: FieldIDDimension
}

type ChildQueryDimensionSelectProps = {
    query: StructuredQuery,
    index: number,
    dimensionType: typeof Dimension,
    updateDimension: (UpdateDimensionParams) => void
}

const ChildQueryDimensionSelect = ({ query, index, dimensionType, updateDimension }: ChildQueryDimensionSelectProps) => {
    // TODO: Generalize to use the same format as in MultiQuery.addSavedMetric()
    if (dimensionType !== DatetimeFieldDimension) {
        return <div>This shared dimension type isn't supported</div>
    }

    // const compatibleDimensions = query.table().fields.map((field) => field.dimension());
    const compatibleDimensions = query.table().dateFields().map((field) => field.dimension());

    const currentDimension = compatibleDimensions.find((dim) =>
        Dimension.isEqual(dim, DatetimeFieldDimension.parseMBQL(query.breakouts()[0]).baseDimension())
    )

    return (
        <div className="pr1">
            <MetricWidget
                key={"metric" + index}
                metric={query}
            />
            <Select
                className="border-med bg-white block"
                value={currentDimension}
                onChange={({ target: { value: updatedDimension } }) => updateDimension({ index, updatedDimension })}
                isInitiallyOpen={false}
                placeholder="Select…"
            >
                { compatibleDimensions.map(dimension =>
                    <Option value={dimension}>{dimension.displayName()}</Option>
                )}
            </Select>
        </div>
    )
}

export default class MultiQueryDimensionOptions extends Component {
    props: {
        query: MultiQuery,
        updateQuery: (MultiQuery) => void
    }

    updateChildQueryDimension = ({ index, updatedDimension }: UpdateDimensionParams) => {
        const { query, updateQuery } = this.props;

        const breakoutDimension = new DatetimeFieldDimension(updatedDimension, query.sharedDimension.bucketing());

        const updatedMultiQuery = query.setQueryAtIndexWith(index, (atomicQuery) =>
            atomicQuery instanceof StructuredQuery
                ? atomicQuery.updateBreakout(0, breakoutDimension.mbql())
                : atomicQuery
        );
        updateQuery(updatedMultiQuery);
    }

    render() {
        const { query } = this.props;

        const dimensionType = query.sharedDimension().constructor;
        if (dimensionType !== DatetimeFieldDimension) {
            return <div>This shared dimension type isn't supported</div>
        }

        const atomicQueries: StructuredQuery[] = query.atomicQueries();

        // Somehow fetch the dimension name from metadata
        return (
            <div className="align-center flex-full flex flex-wrap">
                { atomicQueries.map((childQuery, index) =>
                    <ChildQueryDimensionSelect query={childQuery} index={index}
                                               dimensionType={dimensionType}
                                               updateDimension={this.updateChildQueryDimension}/>)
                }
            </div>
        )
    }
}

