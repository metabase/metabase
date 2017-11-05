import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import ListSearchField from "metabase/components/ListSearchField.jsx";
import { List } from 'react-virtualized';

export default class AccordianList extends Component {
    constructor(props, context) {
        super(props, context);

        let openSection;
        // use initiallyOpenSection prop if present
        if (props.initiallyOpenSection !== undefined) {
            openSection = props.initiallyOpenSection;
        }
        // otherwise try to find the selected section, if any
        if (openSection === undefined) {
            openSection = _.findIndex(props.sections, (section, index) => this.sectionIsSelected(section, index));
            if (openSection === -1) {
                openSection = undefined;
            }
        }
        // default to the first section
        if (openSection === undefined) {
            openSection = 0;
        }

        this.state = {
            openSection,
            searchText: ""
        };
    }

    static propTypes = {
        id: PropTypes.string,
        sections: PropTypes.array.isRequired,
        searchable: PropTypes.oneOfType([PropTypes.bool, PropTypes.func]),
        initiallyOpenSection: PropTypes.number,
        openSection: PropTypes.number,
        onChange: PropTypes.func,
        onChangeSection: PropTypes.func,
        itemIsSelected: PropTypes.func,
        itemIsClickable: PropTypes.func,
        renderItem: PropTypes.func,
        renderSectionIcon: PropTypes.func,
        getItemClasses: PropTypes.func,
        alwaysTogglable: PropTypes.bool,
        alwaysExpanded: PropTypes.bool,
        hideSingleSectionTitle: PropTypes.bool,
    };

    static defaultProps = {
        style: {},
        searchable: (section) => section.items && section.items.length > 10,
        alwaysTogglable: false,
        alwaysExpanded: false,
        hideSingleSectionTitle: false,
    };

    componentDidMount() {
        // TODO: reimplement scrolling currently selected item into view
    }

    toggleSection(sectionIndex) {
        if (this.props.onChangeSection) {
            if (this.props.onChangeSection(sectionIndex) === false) {
                return;
            }
        }

        let openSection = this.getOpenSection();
        if (openSection === sectionIndex) {
            sectionIndex = null;
        }
        this.setState({ openSection: sectionIndex });

    }

    getOpenSection() {
        if (this.props.sections.length === 1) {
            return 0;
        }

        let { openSection } = this.state;
        if (openSection === undefined) {
            for (let [index, section] of this.props.sections.entries()) {
                if (this.sectionIsSelected(section, index)) {
                    openSection = index;
                    break;
                }
            }
        }
        return openSection;
    }

    sectionIsSelected(section, sectionIndex) {
        let { sections } = this.props;
        let selectedSection = null;
        for (let i = 0; i < sections.length; i++) {
            if (_.some(sections[i].items, (item) => this.itemIsSelected(item))) {
                selectedSection = i;
                break;
            }
        }
        return selectedSection === sectionIndex;
    }

    itemIsClickable(item) {
        if (this.props.itemIsClickable) {
            return this.props.itemIsClickable(item);
        } else {
            return true;
        }
    }

    itemIsSelected(item) {
        if (this.props.itemIsSelected) {
            return this.props.itemIsSelected(item);
        } else {
            return false;
        }
    }

    onChange(item) {
        if (this.props.onChange) {
            this.props.onChange(item);
        }
    }

    renderItemExtra(item, itemIndex) {
        if (this.props.renderItemExtra) {
            return this.props.renderItemExtra(item, itemIndex);
        } else {
            return null;
        }
    }

    renderItemIcon(item, itemIndex) {
        if (this.props.renderItemIcon) {
            return this.props.renderItemIcon(item, itemIndex);
        } else {
            return null;
        }
    }

    renderSectionIcon(section, sectionIndex) {
        if (this.props.renderSectionIcon) {
            return <span className="List-section-icon mr2">{this.props.renderSectionIcon(section, sectionIndex)}</span>;
        } else {
            return null;
        }
    }

    getItemClasses(item, itemIndex) {
        return this.props.getItemClasses && this.props.getItemClasses(item, itemIndex);
    }

    renderSectionHeader(section, sectionIndex) {

    }

    render() {
        const { id, style, searchable, searchPlaceholder, sections, showItemArrows, alwaysTogglable, alwaysExpanded, hideSingleSectionTitle,  } = this.props;
        const { searchText } = this.state;

        const openSection = this.getOpenSection();
        const sectionIsExpanded = (sectionIndex) =>
            alwaysExpanded || openSection === sectionIndex;
        const sectionIsSearchable = (sectionIndex) =>
            searchable && (typeof searchable !== "function" || searchable(sections[sectionIndex]));
        const sectionIsTogglable  = (sectionIndex) =>
            alwaysTogglable || sections.length > 1;

        const rows = []
        for (const [sectionIndex, section] of sections.entries()) {
            const isLastSection = sectionIndex === sections.length - 1;
            if (section.name && (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable)) {
                rows.push({ type: "header", section, sectionIndex, isLastSection })
            }
            if (sectionIsSearchable(sectionIndex) && sectionIsExpanded(sectionIndex) && section.items && section.items.length > 0) {
                rows.push({ type: "search", section, sectionIndex, isLastSection })
            }
            if (sectionIsExpanded(sectionIndex) && section.items && section.items.length > 0) {
                for (const [itemIndex, item] of section.items.entries()) {
                    if (!searchText || item.name.toLowerCase().includes(searchText.toLowerCase())) {
                        const isLastItem = itemIndex === section.items.length - 1;
                        rows.push({ type: "item", section, sectionIndex, isLastSection, item, itemIndex, isLastItem });
                    }
                }
            }
        }

        const getRowHeight = ({ index }) =>
            rows[index].type === "header" && alwaysExpanded ? 44 : // "alwaysExpanded" style uses shorter headers
            rows[index].type === "header" ? 56 :
            rows[index].type === "search" ? 56 :
            rows[index].type === "item" ?  36 + (rows[index].isLastItem ? 8 : 0) : // add padding for last row
            0;

        const width = 300;
        const height = Math.min(500, rows.reduce((height, row, index) => height + getRowHeight({ index }), 0));

        return (
            <List
                id={id}
                className={this.props.className}
                style={style}
                width={width}
                height={height}
                rowCount={rows.length}
                rowHeight={getRowHeight}
                rowRenderer={({ key, index, style }) => {
                    const { type, section, sectionIndex, item, itemIndex } = rows[index];
                    return (
                        <section
                            key={key}
                            style={style}
                            className={cx("List-section", section.className, {
                                "List-section--expanded": sectionIsExpanded(sectionIndex),
                                "List-section--togglable": sectionIsTogglable(sectionIndex)
                            })}
                        >
                            { type === "header" ? (
                                alwaysExpanded ?
                                    <div className="px2 pt2 h6 text-grey-2 text-uppercase text-bold">
                                        {section.name}
                                    </div>
                                :
                                    <div className={cx("p1", {
                                        "border-top": sectionIndex !== 0,
                                        "border-bottom": sectionIsExpanded(sectionIndex)
                                    })}>
                                        <div
                                            className={cx("List-section-header px1 py1 full flex align-center", {
                                                "cursor-pointer": sectionIsTogglable(sectionIndex)
                                            })}
                                            onClick={sectionIsTogglable(sectionIndex) && (() => this.toggleSection(sectionIndex))}
                                        >
                                            { this.renderSectionIcon(section, sectionIndex) }
                                            <h3 className="List-section-title">{section.name}</h3>
                                            { sections.length > 1 && section.items && section.items.length > 0 &&
                                                <span className="flex-align-right">
                                                    <Icon name={sectionIsExpanded(sectionIndex) ? "chevronup" : "chevrondown"} size={12} />
                                                </span>
                                            }
                                        </div>
                                    </div>
                            ) : type === "search" ?
                                <div className="m1" style={{border: "2px solid transparent", borderRadius: "6px"}}>
                                    <ListSearchField
                                        onChange={(val) => this.setState({searchText: val})}
                                        searchText={this.state.searchText}
                                        placeholder={searchPlaceholder}
                                        autoFocus
                                    />
                                </div>
                            : type === "item" ?
                                <div
                                    className={cx("List-item flex mx1", {
                                        'List-item--selected': this.itemIsSelected(item, itemIndex),
                                        'List-item--disabled': !this.itemIsClickable(item)
                                    }, this.getItemClasses(item, itemIndex))}
                                >
                                    <a
                                        className={cx("p1 flex-full flex align-center", this.itemIsClickable(item) ? "cursor-pointer" : "cursor-default")}
                                        onClick={this.itemIsClickable(item) && this.onChange.bind(this, item)}
                                    >
                                        <span className="flex align-center">{ this.renderItemIcon(item, itemIndex) }</span>
                                        <h4 className="List-item-title ml1">{item.name}</h4>
                                    </a>
                                    { this.renderItemExtra(item, itemIndex) }
                                    { showItemArrows &&
                                        <div className="List-item-arrow flex align-center px1">
                                            <Icon name="chevronright" size={8} />
                                        </div>
                                    }
                                </div>
                            :
                                <div>UNKNOWN ROW TYPE</div>
                            }
                        </section>
                    );
                }}
            />
        );
    }
}
