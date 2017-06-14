/* @flow */
import React, { Component } from "react";
import Select, { Option } from "metabase/components/Select";
import MultiQuery from "metabase-lib/lib/queries/MultiQuery";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Dimension from "metabase-lib/lib/Dimension";
import MetricWidget from "metabase/query_builder/components/MetricWidget";
import Field from "metabase-lib/lib/metadata/Field";

type ChildQueryDimensionSelectProps = {
    multiQuery: MultiQuery,
    atomicQuery: StructuredQuery,
    index: number,
    updateBreakoutField: (any) => void
}

const ChildQueryBreakoutFieldSelect = ({ multiQuery, atomicQuery, index, updateBreakoutField } : ChildQueryDimensionSelectProps) => {
    const compatibleFields = multiQuery.compatibleFieldsFor(atomicQuery);

    const currentField = Dimension.parseMBQL(atomicQuery.breakouts()[0], atomicQuery.metadata()).field();

    return (
        <div className="pr1">
            <MetricWidget
                key={"metric" + index}
                metric={atomicQuery}
            />
            <Select
                className="border-med bg-white block"
                value={currentField}
                onChange={({ target: { value: newField } }) => updateBreakoutField({ index, newField })}
                isInitiallyOpen={false}
                placeholder="Select…"
            >
                { compatibleFields.map(field =>
                    <Option key={field.name} value={field}>{field.display_name}</Option>
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

    updateAtomicQueryBreakoutField = ({ index, newField }: { index: number, newField: Field }) => {
        const { query, updateQuery } = this.props;

        const breakoutDimension = query.breakoutDimensionFor(newField);

        const updatedMultiQuery = query.setQueryAtIndexWith(index, (atomicQuery) =>
            atomicQuery instanceof StructuredQuery
                ? atomicQuery.updateBreakout(0, breakoutDimension.mbql())
                : atomicQuery
        );

        updateQuery(updatedMultiQuery);
    }

    render() {
        const { query } = this.props;

        const atomicQueries: StructuredQuery[] = query.atomicQueries();

        // Somehow fetch the dimension name from metadata
        return (
            <div className="align-center flex-full flex flex-wrap">
                { atomicQueries.map((atomicQuery, index) =>
                    <ChildQueryBreakoutFieldSelect key={index}
                                               index={index}
                                               atomicQuery={atomicQuery}
                                               multiQuery={query}
                                               updateBreakoutField={this.updateAtomicQueryBreakoutField}/>)
                }
            </div>
        )
    }
}

