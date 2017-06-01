/* @flow weak */

import React, { Component } from "react";
import PropTypes from "prop-types";

import AccordianList from "metabase/components/AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import { stripId, singularize } from "metabase/lib/formatting";

import Dimension from "metabase-lib/lib/Dimension";

import type { ConcreteField } from "metabase/meta/types/Query";
import type { TableMetadata } from "metabase/meta/types/Metadata";

// import type { Section } from "metabase/components/AccordianList";
export type AccordianListItem = {
}

export type AccordianListSection = {
    name: string;
    items: AccordianListItem[]
}

type Props = {
    className?: string,

    field: ?ConcreteField,
    onFieldChange: (field: ConcreteField) => void,

    // HACK: for segments
    onFilterChange?: (filter: any) => void,

    tableMetadata: TableMetadata,
    alwaysExpanded?: boolean
}

type State = {
    sections: AccordianListSection[]
}

export default class FieldList extends Component {
    props: Props;
    state: State = {
        sections: []
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        segmentOptions: PropTypes.array,
        tableName: PropTypes.string,
        onFieldChange: PropTypes.func.isRequired,
        onFilterChange: PropTypes.func,
        enableTimeGrouping: PropTypes.bool,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { tableMetadata, fieldOptions, segmentOptions } = newProps;
        let tableName = tableMetadata.display_name;

        let specialOptions = [];
        if (segmentOptions) {
            specialOptions = segmentOptions.map(segment => ({
                name: segment.name,
                value: ["SEGMENT", segment.id],
                segment: segment
            }));
        }

        const getSectionItems = (sectionOptions) =>
            sectionOptions.dimensions.map(dimension => ({
                name: dimension.displayName(),
                dimension: dimension
            }))

        let mainSection = {
            name: singularize(tableName),
            items: specialOptions.concat(getSectionItems(fieldOptions))
        };

        let fkSections = fieldOptions.fks.map(fkOptions => ({
            name: stripId(fkOptions.field.display_name),
            items: getSectionItems(fkOptions)
        }));

        let sections = []
        if (mainSection.items.length > 0) {
            sections.push(mainSection);
        }
        sections.push(...fkSections);

        this.setState({ sections });
    }

    itemIsSelected = (item) => {
        return item.dimension && item.dimension.isSameBaseDimension(this.props.field);
    }

    renderItemExtra = (item) => {
        let { field } = this.props;

        return (
            <div className="Field-extra flex align-center">
                { item.segment &&
                    this.renderSegmentTooltip(item.segment)
                }
                { item.dimension && item.dimension.tag &&
                    <span className="h5 text-grey-2 px1">{item.dimension.tag}</span>
                }
                { item.dimension && item.dimension.dimensions().length > 0 ?
                    <PopoverWithTrigger
                        className={this.props.className}
                        hasArrow={false}
                        triggerElement={this.renderSubDimensionTrigger(item.dimension)}
                        tetherOptions={{
                            attachment: 'top left',
                            targetAttachment: 'top right',
                            targetOffset: '0 0',
                            constraints: [{ to: 'window', attachment: 'together', pin: ['left', 'right']}]
                        }}
                    >
                        <DimensionPicker
                            dimension={Dimension.parseMBQL(field)}
                            dimensions={item.dimension.dimensions()}
                            onChangeDimension={dimension => this.props.onFieldChange(dimension.mbql())}
                        />
                    </PopoverWithTrigger>
                : null }
            </div>
        );
    }

    renderItemIcon = (item) => {
        let name;
        if (item.segment) {
            name = "staroutline";
        } else if (item.dimension) {
            name = item.dimension.icon();
        }
        return <Icon name={name || 'unknown'} size={18} />;
    }

    renderSubDimensionTrigger(dimension) {
        const defaultDimension = dimension.defaultDimension();
        const name = defaultDimension ? defaultDimension.subTriggerDisplayName() : null;
        return (
            <div className="FieldList-grouping-trigger flex align-center p1 cursor-pointer">
                {name && <h4 className="mr1">{name}</h4> }
                <Icon name="chevronright" size={16} />
            </div>
        );
    }

    renderSegmentTooltip(segment) {
        let { tableMetadata } = this.props;
        return (
            <div className="p1">
                <Tooltip tooltip={<QueryDefinitionTooltip object={segment} tableMetadata={tableMetadata} />}>
                    <span className="QuestionTooltipTarget" />
                </Tooltip>
            </div>
        );
    }

    getItemClasses = (item, itemIndex) => {
        if (item.segment) {
            return "List-item--segment";
        } else {
            return null;
        }
    }

    renderSectionIcon = (section, sectionIndex) => {
        if (sectionIndex > 0) {
            return <Icon name="connections" size={18} />
        } else {
            return <Icon name="table2" size={18} />;
        }
    }

    onChange = (item) => {
        if (item.segment && this.props.onFilterChange) {
            this.props.onFilterChange(item.value);
        } else if (this.props.field != null && this.itemIsSelected(item)) {
            // ensure if we select the same item we don't reset datetime-field's unit
            this.props.onFieldChange(this.props.field);
        } else {
            const dimension = item.dimension.defaultDimension() || item.dimension;
            this.props.onFieldChange(dimension.mbql());
        }
    }

    render() {
        return (
            <AccordianList
                className={this.props.className}
                sections={this.state.sections}
                onChange={this.onChange}
                itemIsSelected={this.itemIsSelected}
                renderSectionIcon={this.renderSectionIcon}
                renderItemExtra={this.renderItemExtra}
                renderItemIcon={this.renderItemIcon}
                getItemClasses={this.getItemClasses}
                alwaysExpanded={this.props.alwaysExpanded}
            />
        )
    }
}

import cx from "classnames";

const DimensionPicker = ({ className, dimension, dimensions, onChangeDimension }) => {
    return (
        <ul className="px2 py1">
            { dimensions.map((d, index) =>
                <li
                    key={index}
                    className={cx("List-item", { "List-item--selected": d.isEqual(dimension) })}
                >
                    <a className="List-item-title full px2 py1 cursor-pointer" onClick={() => onChangeDimension(d)}>
                        {d.subDisplayName()}
                    </a>
                </li>
            )}
        </ul>
    )
}
