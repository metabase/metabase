/* @flow */
import React, { Component } from "react";
import ReactDOM from "react-dom";

import Input from "metabase/components/Input";
import HeaderModal from "metabase/components/HeaderModal";
import TitleAndDescription from "metabase/components/TitleAndDescription";
import EditBar from "metabase/components/EditBar";

import { getScrollY } from "metabase/lib/dom";

type Props = {
    // Buttons to be displayed in the header
    headerButtons: [],

    // Whether or not editing is taking place
    isEditing: bool,
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
    editingButtons: []
}

export default class Header extends Component {
    props: Props

    state = {
        headerHeight: 0
    }

    static defaultProps = {
        headerButtons: [],
        isEditing: false,
        editingTitle: "",
        editingSubtitle: "",
        editingButtons: [],
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

        const rect = ReactDOM.findDOMNode(this.refs.header).getBoundingClientRect();
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
            editingButtons,
            headerButtons,
            objectType
        } = this.props

        return (
            <div>
                { isEditing && (
                    <EditBar
                        title={editingTitle}
                        subtitle={editingSubtitle}
                        // TODO - @kdoh - shouldnt bars have standard buttons?
                        buttons={editingButtons}
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
                        {
                            isEditingInfo
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
                        {
                            // TODO - @kdoh - does this ever evalutate to true?
                            item && item.creator && (
                                <div className="Header-attribution">
                                    Asked by {item.creator.common_name}
                                </div>
                            )
                        }
                    </div>

                    <div className="flex align-center flex-align-right">
                        {headerButtons.map((section, sectionIndex) => {
                            return section && section.length > 0 && (
                                <span
                                    key={sectionIndex}
                                    className="Header-buttonSection flex align-center"
                                >
                                    {section.map((button, buttonIndex) =>
                                        <span key={buttonIndex} className="Header-button">
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
