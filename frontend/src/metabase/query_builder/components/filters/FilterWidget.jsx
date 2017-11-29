/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";
import FieldName from '../FieldName.jsx';
import Popover from "metabase/components/Popover.jsx";
import FilterPopover from "./FilterPopover.jsx";

import { generateTimeFilterValuesDescriptions } from "metabase/lib/query_time";
import { formatValue } from "metabase/lib/formatting";

import cx from "classnames";
import _ from "underscore";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import type { Filter } from "metabase/meta/types/Query";

type Props = {
    query: StructuredQuery,
    filter: Filter,
    index: number,
    // TODO - why are these optionals?
    updateFilter?: (index: number, field: Filter) => void,
    removeFilter?: (index: number) => void,

    // TODO - what is this for?
    maxDisplayValues?: number
}
type State = {
    isOpen: bool
}

export default class FilterWidget extends Component {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);

        this.state = {
            isOpen: this.props.filter[0] == undefined
        };
    }

    static defaultProps = {
        maxDisplayValues: 1
    };

    open = () => {
        this.setState({ isOpen: true });
    }

    close = () => {
        this.setState({ isOpen: false });
    }

    render() {
        const { filter, index, query, removeFilter, updateFilter } = this.props
        const { isOpen } = this.state

        const segment = _.find(query.table().segments, (s) => s.id === filter[1]);

        const isSegment = filter[0] === "SEGMENT"

        return (
            <div className={cx("Query-filter p2", { "selected": isOpen })}>
                <div onClick={this.open}>
                    <div>
                    { isSegment
                        ? "Matches"
                        : <OperatorFieldName {...this.props} />
                    }
                    </div>
                    <FilterValue>
                        { isSegment
                            // TODO - having to do this check seems insane
                            ? segment && segment.name
                            : <OperatorValue {...this.props} />
                        }

                        { removeFilter && (
                            <RemoveFilter onClick={event => {
                                // stop the event from bubbling so
                                // we don't open the popover
                                event.stopPropagation()
                                // remove the filter
                                removeFilter(index)
                            }} />
                        )}
                    </FilterValue>
                </div>
                { isOpen && (
                    <Popover
                        id="FilterPopover"
                        ref="filterPopover"
                        className="FilterPopover"
                        isInitiallyOpen={filter[1] === null}
                        onClose={this.close}
                        horizontalAttachments={["left"]}
                        autoWidth
                    >
                        <FilterPopover
                            query={query}
                            filter={filter}
                            onCommitFilter={filter =>
                                updateFilter && updateFilter(index, filter)
                            }
                            onClose={this.close}
                        />
                    </Popover>
                )}
            </div>
        );
    }
}

const OperatorFieldName = ({ ...props }) => {
    let [op, field] = props.filter;
    const dimension = props.query.parseFieldReference(field);

    if (!dimension) {
        return null;
    }

    const operator = dimension.operator(op);

    return (
        <div className="flex align-center">
            <FieldName
                className="Filter-section Filter-section-field"
                field={field}
                tableMetadata={props.query.table()}
            />
            <div className="Filter-section Filter-section-operator">
                &nbsp;
                <a className="QueryOption flex align-center">
                    {operator && operator.moreVerboseName}
                </a>
            </div>
        </div>
    )
}

const RemoveFilter = ({ onClick }) =>
    <span onClick={onClick}>
        <Icon name="close" size={14} />
    </span>


// This is the purple-y token bit
const FilterValue = ({ children }) =>
    <div className="inline-block bg-purple text-white rounded">
        <div className="flex align-center">
            {children}
        </div>
    </div>

const OperatorValue = ({ ...props }) => {
    const { filter, query, maxDisplayValues } = props;

    let [op, field, ...values] = filter;

    const dimension = query.parseFieldReference(field);

    if (!dimension) {
        return null;
    }

    const operator = dimension.operator(op);

    let formattedValues;
    // $FlowFixMe: not understanding maxDisplayValues is provided by defaultProps
    if (operator && operator.multi && values.length > maxDisplayValues) {
        formattedValues = [values.length + " selections"];
    } else if (dimension.field().isDate()) {
        formattedValues = generateTimeFilterValuesDescriptions(filter);
    } else {
        // TODO Atte Keinänen 7/16/17: Move formatValue to metabase-lib
        formattedValues = values.filter(value => value !== undefined).map(value =>
            formatValue(value, { column: dimension.field() })
        )
    }

    return (
        <div>
            { formattedValues.length > 0 && (
                <div>
                    {formattedValues.map(formattedValue => formattedValue )}
                </div>
            )}
        </div>
    )
}
