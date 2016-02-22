import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import _ from "underscore";

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
            openSection
        };
    }

    static propTypes = {
        sections: PropTypes.array.isRequired,
        initiallyOpenSection: PropTypes.number,
        openSection: PropTypes.number,
        onChange: PropTypes.func,
        onChangeSection: PropTypes.func,
        itemIsSelected: PropTypes.func,
        renderItem: PropTypes.func,
        renderSectionIcon: PropTypes.func,
        getItemClasses: PropTypes.func
    };

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
        let { sections, showItemArrows, alwaysTogglable } = this.props;
        let openSection = this.getOpenSection();

        return (
            <div className={this.props.className} style={{width: '300px'}}>
                {sections.map((section, sectionIndex) =>
                    <section key={sectionIndex} className={cx("List-section", { "List-section--open": openSection === sectionIndex })}>
                        { section.name != null ?
                            <div className="p1 border-bottom">
                                { sections.length > 1 || alwaysTogglable ?
                                    <div className="List-section-header px1 py1 cursor-pointer full flex align-center" onClick={() => this.toggleSection(sectionIndex)}>
                                        { this.renderSectionIcon(section, sectionIndex) }
                                        <h3 className="List-section-title">{section.name}</h3>
                                        { section.items.length > 0 &&
                                            <span className="flex-align-right">
                                                <Icon name={openSection === sectionIndex ? "chevronup" : "chevrondown"} width={12} height={12} />
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
                        { openSection === sectionIndex && section.items.length > 0 &&
                            <ul style={{maxHeight: 400}} className="p1 border-bottom scroll-y scroll-show">
                                { section.items.map((item, itemIndex) =>
                                    <li key={itemIndex} className={cx("List-item flex", { 'List-item--selected': this.itemIsSelected(item, itemIndex) }, this.getItemClasses(item, itemIndex))}>
                                        <a
                                            className="flex-full flex align-center px1 cursor-pointer"
                                            style={{ paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
                                            onClick={this.onChange.bind(this, item)}
                                        >
                                            { this.renderItemIcon(item, itemIndex) }
                                            <h4 className="List-item-title ml2">{item.name}</h4>
                                        </a>
                                        { this.renderItemExtra(item, itemIndex) }
                                        { showItemArrows &&
                                            <div className="List-item-arrow flex align-center px1">
                                                <Icon name="chevronright" width={8} height={8} />
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
