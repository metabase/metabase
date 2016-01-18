import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

import _ from "underscore";

export default class AccordianList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            openSection: props.initiallyOpenSection || undefined
        };
    }

    static propTypes = {
        sections: PropTypes.array.isRequired,
        onChange: PropTypes.func,
        itemIsSelected: PropTypes.func,
        renderItem: PropTypes.func,
        renderSectionIcon: PropTypes.func,
        getItemClasses: PropTypes.func
    };

    toggleSection(sectionIndex) {
        let openSection = this.getOpenSection();
        if (openSection === sectionIndex) {
            this.setState({ openSection: null });
        } else {
            this.setState({ openSection: sectionIndex });
        }
    }

    getOpenSection() {
        let { openSection } = this.state;
        if (openSection === undefined) {
            for (let [index, section] of this.props.sections.entries()) {
                if (this.sectionIsSelected(section, index)) {
                    openSection = index;
                    break;
                }
            }
            if (openSection === undefined) {
                openSection = 0;
            }
        }
        return openSection;
    }

    sectionIsSelected(section, sectionIndex) {
        let { sections } = this.props;
        let selectedSection = 0;
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
            return <span className="mr2">{this.props.renderSectionIcon(section, sectionIndex)}</span>;
        } else {
            return null;
        }
    }

    getItemClasses(item, itemIndex) {
        return this.props.getItemClasses && this.props.getItemClasses(item, itemIndex);
    }

    render() {
        let { sections } = this.props;
        let openSection = this.getOpenSection();

        return (
            <div className={this.props.className} style={{width: '300px'}}>
                {sections.map((section, sectionIndex) =>
                    <section key={sectionIndex} className={cx("List-section", { "List-section--open": openSection === sectionIndex })}>
                        { section.name != null ?
                            <div className="p1 border-bottom">
                                { sections.length > 1 ?
                                    <div className="List-section-header px1 py1 cursor-pointer full flex align-center" onClick={() => this.toggleSection(sectionIndex)}>
                                        <span className="List-section-icon">{ this.renderSectionIcon(section, sectionIndex) }</span>
                                        <h4 className="List-section-title">{section.name}</h4>
                                        <span className="flex-align-right">
                                            <Icon name={openSection === sectionIndex ? "chevronup" : "chevrondown"} width={12} height={12} />
                                        </span>
                                    </div>
                                :
                                    <h4 className="px2 py1 text-default">{section.name}</h4>
                                }
                            </div>
                        : null }
                        { openSection === sectionIndex ?
                            <ul style={{maxHeight: 400}} className="p1 border-bottom scroll-y scroll-show">
                              {section.items.map((item, itemIndex) => {
                                  return (
                                      <li key={itemIndex} className={cx("List-item flex", { 'List-item--selected': this.itemIsSelected(item, itemIndex) }, this.getItemClasses(item, itemIndex))}>
                                          <a className="flex-full flex align-center px1 py1 cursor-pointer"
                                               onClick={this.onChange.bind(this, item)}
                                          >
                                              { this.renderItemIcon(item, itemIndex) }
                                              <h4 className="List-item-title ml2">{item.name}</h4>
                                          </a>
                                          { this.renderItemExtra(item, itemIndex) }
                                      </li>
                                  )
                              })}
                            </ul>
                        : null }
                    </section>
                )}
            </div>
        );
    }
}
