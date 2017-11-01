/* @flow */
import React, { Component } from "react";
import { findDOMNode } from "react-dom";

import Input from "metabase/components/Input";
import HeaderModal from "metabase/components/HeaderModal";
import TitleAndDescription from "metabase/components/TitleAndDescription";
import EditBar from "metabase/components/EditBar";

import { getScrollY } from "metabase/lib/dom";

type Props = {
    // Buttons to be displayed in the header in default mode
    defaultActions: [],

    // Actions to be displayed in the header in edit mode
    editingActions: [],

    // Actions to be displayed in the header if in fullscreen mode
    fullscreenActions: [],

    // Whether or not editing is taking place
    isEditing: bool,

    // Whether or not fullscreen is active
    isFullscreen: bool,

    // What is this for and why?
    isEditingInfo: bool,

    // The item in question being viewed, most likely a question or dashbaord
    item: {
        name: string,
        description: ?string,
        creator: {
            common_name: string
        }
    },

    // The kind of thing being edited, again, probably a dashboard or question
    objectType: string,

    // the function that gets called when you edit the title or description
    setItemAttributeFn: (attribute: string, value: string) => void,

    headerModalMessage: ?string,
    onHeaderModalDone?: () => void,
    onHeaderModalCancel?: () => void,
    editingTitle: string,
    editingSubtitle: string,
    editBarButtons: [],
}

export default class Header extends Component {
    props: Props

    state = {
        headerHeight: 0
    }

    static defaultProps = {
        defaultActions: [],
        editingActions: [],
        fullscreenActions: [],
        editingTitle: "",
        editingSubtitle: "",
        isEditing: false,
        isFullscreen: false,
    }

   componentDidMount() {
        this.updateHeaderHeight();
   }

    componentWillUpdate() {
        const modalIsOpen = !!this.props.headerModalMessage;
        if (modalIsOpen) {
            this.updateHeaderHeight()
        }
    }

    updateHeaderHeight() {
        if (!this.refs.header) return;

        const rect = findDOMNode(this.refs.header).getBoundingClientRect();
        const headerHeight = rect.top + getScrollY();
        if (this.state.headerHeight !== headerHeight) {
            this.setState({ headerHeight });
        }
    }

    setItemAttribute(attribute: string, { target }: SyntheticInputEvent) {
        this.props.setItemAttributeFn(attribute, target.value);
    }

    render() {
        const {
            item,
            isEditing,
            isEditingInfo,
            editingTitle,
            editingSubtitle,
            defaultActions,
            editingActions,
            fullscreenActions,
            objectType,
            isFullscreen,
            editBarButtons
        } = this.props

        return (
            <div>
                { isEditing && (
                    <EditBar
                        title={editingTitle}
                        subtitle={editingSubtitle}
                        // TODO - @kdoh - shouldnt bars have standard buttons?
                        buttons={editBarButtons}
                    />
                )}
                {
                    // TODO - @kdoh - this is highly specific to the dashbaord
                    // header and should be refactored out
                }
                <HeaderModal
                    isOpen={!!this.props.headerModalMessage}
                    height={this.state.headerHeight}
                    title={this.props.headerModalMessage}
                    onDone={this.props.onHeaderModalDone}
                    onCancel={this.props.onHeaderModalCancel}
                />
                <div className="py1 lg-py2 xl-py3 wrapper flex align-center" ref="header">
                    <div className="Entity py3">
                        {isEditing
                                ? (
                                    <div className="Header-title flex flex-column flex-full bordered rounded my1">
                                        <Input
                                            className="AdminInput text-bold border-bottom rounded-top h3"
                                            type="text"
                                            value={item.name || ""}
                                            onChange={this.setItemAttribute.bind(this, "name")}
                                        />
                                        <Input
                                            className="AdminInput rounded-bottom h4"
                                            type="text"
                                            value={item.description || ""}
                                            onChange={this.setItemAttribute.bind(this, "description")}
                                            placeholder="No description yet"
                                        />
                                    </div>
                                )
                                : (
                                    <TitleAndDescription
                                        title={item && item.id
                                                ? item.name
                                                : `New ${objectType}`
                                        }
                                        description={item.description}
                                    />
                                )
                        }
                    </div>

                    { /* TODO - this should get cleaned up */ }
                    <div className="flex align-center ml-auto">
                        {!isEditing && !isFullscreen && defaultActions.map((section, sectionIndex) => {
                            return section && section.length > 0 && (
                                <span key={sectionIndex} className="flex align-center">
                                    {section.map((button, buttonIndex) =>
                                        <span key={buttonIndex}>
                                            {button}
                                        </span>
                                    )}
                                </span>
                            );
                        })}
                        { isEditing && !isFullscreen && editingActions.map((section, sectionIndex) => {
                            return section && section.length > 0 && (
                                <span key={sectionIndex} className="flex align-center">
                                    {section.map((button, buttonIndex) =>
                                        <span key={buttonIndex}>
                                            {button}
                                        </span>
                                    )}
                                </span>
                            );

                        })}

                        { isFullscreen && fullscreenActions.map((section, sectionIndex) => {
                            return section && section.length > 0 && (
                                <span key={sectionIndex} className="flex align-center">
                                    {section.map((button, buttonIndex) =>
                                        <span key={buttonIndex}>
                                            {button}
                                        </span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
