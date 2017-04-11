import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import cx from "classnames";
import _ from "underscore";
import { elementIsInView } from "metabase/lib/dom";

import Icon from "metabase/components/Icon.jsx";
import ListSearchField from "metabase/components/ListSearchField.jsx";


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
        // when the component is mounted and an item is selected then scroll to it
        const element = this.refs.selected && ReactDOM.findDOMNode(this.refs.selected);
        if (element && !elementIsInView(element)) {
            element.scrollIntoView();
        }
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

    render() {
        const { id, searchable, searchPlaceholder, sections, showItemArrows, alwaysTogglable, alwaysExpanded, hideSingleSectionTitle, style } = this.props;
        const { searchText } = this.state;

        const openSection = this.getOpenSection();
        const sectionIsOpen = (sectionIndex) =>
            alwaysExpanded || openSection === sectionIndex;
        const sectionIsSearchable = (sectionIndex) =>
            searchable && (typeof searchable !== "function" || searchable(sections[sectionIndex]));

        return (
            <div id={id} className={this.props.className} style={{ width: '300px', ...style }}>
                {sections.map((section, sectionIndex) =>
                    <section key={sectionIndex} className={cx("List-section", { "List-section--open": sectionIsOpen(sectionIndex) })}>
                        { section.name && alwaysExpanded ?
                            (!hideSingleSectionTitle || sections.length > 1 || alwaysTogglable) &&
                                <div className="px2 pt2 h6 text-grey-2 text-uppercase text-bold">
                                    {section.name}
                                </div>
                        : section.name ?
                            <div className={"p1 border-bottom"}>
                                { !hideSingleSectionTitle || sections.length > 1 || alwaysTogglable ?
                                    <div className="List-section-header px1 py1 cursor-pointer full flex align-center" onClick={() => this.toggleSection(sectionIndex)}>
                                        { this.renderSectionIcon(section, sectionIndex) }
                                        <h3 className="List-section-title">{section.name}</h3>
                                        { sections.length > 1 && section.items && section.items.length > 0 &&
                                            <span className="flex-align-right">
                                                <Icon name={sectionIsOpen(sectionIndex) ? "chevronup" : "chevrondown"} size={12} />
                                            </span>
                                        }
                                    </div>
                                :
                                    <div className="px1 py1 flex align-center">
                                        { this.renderSectionIcon(section, sectionIndex) }
                                        <h3 className="text-default">{section.name}</h3>
                                    </div>
                                }
                            </div>
                        : null }

                        { sectionIsSearchable(sectionIndex) &&  sectionIsOpen(sectionIndex) && section.items && section.items.length > 0 &&
                            /* NOTE: much of this structure is here just to match strange stuff in 'List-item' below so things align properly */
                            <div className="px1 pt1">
                                <div style={{border: "2px solid transparent", borderRadius: "6px"}}>
                                    <ListSearchField
                                        onChange={(val) => this.setState({searchText: val})}
                                        searchText={this.state.searchText}
                                        placeholder={searchPlaceholder}
                                        autoFocus
                                    />
                                </div>
                            </div>
                        }

                        { sectionIsOpen(sectionIndex) && section.items && section.items.length > 0 &&
                            <ul
                                style={{ maxHeight: alwaysExpanded ? undefined : 400}}
                                className={cx("p1", { "border-bottom scroll-y scroll-show": !alwaysExpanded })}
                            >
                                { section.items.filter((i) => searchText ? (i.name.toLowerCase().includes(searchText.toLowerCase())) : true ).map((item, itemIndex) =>
                                    <li
                                        key={itemIndex}
                                        ref={this.itemIsSelected(item, itemIndex) ? "selected" : null}
                                        className={cx("List-item flex", { 'List-item--selected': this.itemIsSelected(item, itemIndex), 'List-item--disabled': !this.itemIsClickable(item) }, this.getItemClasses(item, itemIndex))}
                                    >
                                        <a
                                            className={cx("flex-full flex align-center px1", this.itemIsClickable(item) ? "cursor-pointer" : "cursor-default")}
                                            style={{ paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
                                            onClick={this.itemIsClickable(item) && this.onChange.bind(this, item)}
                                        >
                                            { this.renderItemIcon(item, itemIndex) }
                                            <h4 className="List-item-title ml2">{item.name}</h4>
                                        </a>
                                        { this.renderItemExtra(item, itemIndex) }
                                        { showItemArrows &&
                                            <div className="List-item-arrow flex align-center px1">
                                                <Icon name="chevronright" size={8} />
                                            </div>
                                        }
                                    </li>
                                )}
                            </ul>
                        }
                    </section>
                )}
            </div>
        );
    }
}
