/* @flow */

import React, { Component } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./Text.css";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
    padding: 4
};

type State = {
    isShowingRenderedOutput: boolean,
    text: string
}

export default class Text extends Component {
    props: VisualizationProps;
    state: State;

    constructor(props: VisualizationProps) {
        super(props);

        this.state = {
            isShowingRenderedOutput: false,
            text: ""
        };
    }

    static uiName = "Text";
    static identifier = "text";
    static iconName = "text";

    static disableSettingsConfig = true;
    static noHeader = true;
    static supportsSeries = false;
    static hidden = true;

    static minSize = { width: 4, height: 2 };

    static checkRenderable() {
        // text can always be rendered, nothing needed here
    }

    static settings = {
        "text": {
            value: "",
            default: ""
        }
    }

    handleTextChange(text: string) {
        this.props.onUpdateVisualizationSettings({ "text": text });
    }

    onEdit() {
        this.setState({ isShowingRenderedOutput: false });
    }

    onPreview() {
        this.setState({ isShowingRenderedOutput: true });
    }

    render() {
        let { className, actionButtons, gridSize, settings, isEditing } = this.props;
        let isSmall = gridSize && gridSize.width < 4;

        if (isEditing) {
            return (
                <div className={cx(className, styles.Text, styles[isSmall ? "small" : "large"], styles["dashboard-is-editing"])}>
                    <TextActionButtons
                        actionButtons={actionButtons}
                        isShowingRenderedOutput={this.state.isShowingRenderedOutput}
                        onEdit={this.onEdit.bind(this)}
                        onPreview={this.onPreview.bind(this)}
                    />
                    {this.state.isShowingRenderedOutput ?
                        <ReactMarkdown
                            className={cx("full flex-full flex flex-column text-card-markdown", styles["text-card-markdown"])}
                            source={settings.text}
                        />
                    :
                        <textarea
                            className={cx("full flex-full flex flex-column bg-grey-0 bordered drag-disabled", styles["text-card-textarea"])}
                            name="text"
                            placeholder="Write here"
                            value={settings.text}
                            onChange={(e) => this.handleTextChange(e.target.value)}
                        />
                    }
                    <a
                        className={cx("text-grey-3 text-small text-bold", styles["text-card-help"])}
                        href="https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet"
                        target={window.OSX ? null : "_blank"}
                    >
                        Styling with Markdown is supported
                    </a>
                </div>
            );
        } else {
            return (
                <div className={cx(className, styles.Text, styles[isSmall ? "small" : "large"])}>
                    <ReactMarkdown
                        className={cx("full flex-full flex flex-column text-card-markdown", styles["text-card-markdown"])}
                        source={settings.text}
                    />
                </div>
            );
        }
    }
}

const TextActionButtons = ({ actionButtons, isShowingRenderedOutput, onEdit, onPreview }) =>
    <div className="Card-title">
        <div className="absolute top left p1 px2">
            <span className="DashCard-actions-persistent flex align-center" style={{ lineHeight: 1 }}>
                <a
                    data-metabase-event={"Dashboard;Text;edit"}
                    className={cx(" cursor-pointer h3 flex-no-shrink relative mr1", { "text-grey-2 text-grey-4-hover": isShowingRenderedOutput, "text-brand": !isShowingRenderedOutput })}
                    onClick={onEdit}
                    style={HEADER_ACTION_STYLE}
                >
                    <span className="flex align-center">
                        <span className="flex">
                            <Icon name="editdocument" style={{ top: 0, left: 0 }} size={HEADER_ICON_SIZE} />
                        </span>
                    </span>
                </a>

                <a
                    data-metabase-event={"Dashboard;Text;preview"}
                    className={cx(" cursor-pointer h3 flex-no-shrink relative mr1", { "text-grey-2 text-grey-4-hover": !isShowingRenderedOutput, "text-brand": isShowingRenderedOutput })}
                    onClick={onPreview}
                    style={HEADER_ACTION_STYLE}
                >
                    <span className="flex align-center">
                        <span className="flex">
                            <Icon name="eye" style={{ top: 0, left: 0 }} size={20} />
                        </span>
                    </span>
                </a>
            </span>
        </div>
        <div className="absolute top right p1 px2">{actionButtons}</div>
    </div>
