/* @flow */

import React, { Component } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./Text.css";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import { t } from "c-3po";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

type State = {
  isShowingRenderedOutput: boolean,
  text: string,
};

const getSettingsStyle = settings => ({
  "align-center": settings["text.align_horizontal"] === "center",
  "align-end": settings["text.align_horizontal"] === "right",
  "justify-center": settings["text.align_vertical"] === "middle",
  "justify-end": settings["text.align_vertical"] === "bottom",
});

export default class Text extends Component {
  props: VisualizationProps;
  state: State;

  constructor(props: VisualizationProps) {
    super(props);

    this.state = {
      isShowingRenderedOutput: false,
      text: "",
    };
  }

  static uiName = "Text";
  static identifier = "text";
  static iconName = "text";

  static disableSettingsConfig = false;
  static noHeader = true;
  static supportsSeries = false;
  static hidden = true;

  static minSize = { width: 4, height: 1 };

  static checkRenderable() {
    // text can always be rendered, nothing needed here
  }

  static settings = {
    "card.title": {
      dashboard: false,
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      default: "",
    },
    "text.align_vertical": {
      section: "Display",
      title: t`Vertical Alignment`,
      widget: "select",
      props: {
        options: [
          { name: t`Top`, value: "top" },
          { name: t`Middle`, value: "middle" },
          { name: t`Bottom`, value: "bottom" },
        ],
      },
      default: "top",
    },
    "text.align_horizontal": {
      section: "Display",
      title: t`Horizontal Alignment`,
      widget: "select",
      props: {
        options: [
          { name: t`Left`, value: "left" },
          { name: t`Center`, value: "center" },
          { name: t`Right`, value: "right" },
        ],
      },
      default: "left",
    },
    "dashcard.background": {
      section: "Display",
      title: t`Show background`,
      dashboard: true,
      widget: "toggle",
      default: true,
    },
  };

  componentWillReceiveProps(newProps: VisualizationProps) {
    // dashboard is going into edit mode
    if (!this.props.isEditing && newProps.isEditing) {
      this.onEdit();
    }
  }

  handleTextChange(text: string) {
    this.props.onUpdateVisualizationSettings({ text: text });
  }

  onEdit() {
    this.setState({ isShowingRenderedOutput: false });
  }

  onPreview() {
    this.setState({ isShowingRenderedOutput: true });
  }

  render() {
    let {
      className,
      actionButtons,
      gridSize,
      settings,
      isEditing,
    } = this.props;
    let isSmall = gridSize && gridSize.width < 4;

    if (isEditing) {
      return (
        <div
          className={cx(
            className,
            styles.Text,
            styles[isSmall ? "small" : "large"],
            styles["dashboard-is-editing"],
          )}
        >
          <TextActionButtons
            actionButtons={actionButtons}
            isShowingRenderedOutput={this.state.isShowingRenderedOutput}
            onEdit={this.onEdit.bind(this)}
            onPreview={this.onPreview.bind(this)}
          />
          {this.state.isShowingRenderedOutput ? (
            <ReactMarkdown
              className={cx(
                "full flex-full flex flex-column text-card-markdown",
                styles["text-card-markdown"],
                getSettingsStyle(settings),
              )}
              source={settings.text}
            />
          ) : (
            <textarea
              className={cx(
                "full flex-full flex flex-column bg-light bordered drag-disabled",
                styles["text-card-textarea"],
              )}
              name="text"
              placeholder={t`Write here, and use Markdown if you''d like`}
              value={settings.text}
              onChange={e => this.handleTextChange(e.target.value)}
            />
          )}
        </div>
      );
    } else {
      return (
        <div
          className={cx(
            className,
            styles.Text,
            styles[isSmall ? "small" : "large"],
            /* if the card is not showing a background we should adjust the left
             * padding to help align the titles with the wrapper */
            { pl0: !settings["dashcard.background"] },
          )}
        >
          <ReactMarkdown
            className={cx(
              "full flex-full flex flex-column text-card-markdown",
              styles["text-card-markdown"],
              getSettingsStyle(settings),
            )}
            source={settings.text}
          />
        </div>
      );
    }
  }
}

const TextActionButtons = ({
  actionButtons,
  isShowingRenderedOutput,
  onEdit,
  onPreview,
}) => (
  <div className="Card-title">
    <div className="absolute top left p1 px2">
      <span
        className="DashCard-actions-persistent flex align-center"
        style={{ lineHeight: 1 }}
      >
        <a
          data-metabase-event={"Dashboard;Text;edit"}
          className={cx(" cursor-pointer h3 flex-no-shrink relative mr1", {
            "text-light text-medium-hover": isShowingRenderedOutput,
            "text-brand": !isShowingRenderedOutput,
          })}
          onClick={onEdit}
          style={HEADER_ACTION_STYLE}
        >
          <span className="flex align-center">
            <span className="flex">
              <Icon
                name="editdocument"
                style={{ top: 0, left: 0 }}
                size={HEADER_ICON_SIZE}
              />
            </span>
          </span>
        </a>

        <a
          data-metabase-event={"Dashboard;Text;preview"}
          className={cx(" cursor-pointer h3 flex-no-shrink relative mr1", {
            "text-light text-medium-hover": !isShowingRenderedOutput,
            "text-brand": isShowingRenderedOutput,
          })}
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
);
