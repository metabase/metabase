/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./Text.css";

import cx from "classnames";
import { t } from "ttag";

import type { VisualizationProps } from "metabase-types/types/Visualization";

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
  static supportPreviewing = true;

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
      section: t`Display`,
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
      section: t`Display`,
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
      section: t`Display`,
      title: t`Show background`,
      dashboard: true,
      widget: "toggle",
      default: true,
    },
  };

  handleTextChange(text: string) {
    this.props.onUpdateVisualizationSettings({ text: text });
  }

  render() {
    const { className, gridSize, settings, isEditing } = this.props;
    const isSingleRow = gridSize && gridSize.height === 1;

    if (isEditing) {
      return (
        <div className={cx(className, styles.Text)}>
          {this.props.isPreviewing ? (
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
              placeholder={t`Write here, and use Markdown if you'd like`}
              value={settings.text}
              onChange={e => this.handleTextChange(e.target.value)}
            />
          )}
        </div>
      );
    } else {
      return (
        <div
          className={cx(className, styles.Text, {
            /* if the card is not showing a background we should adjust the left
             * padding to help align the titles with the wrapper */
            pl0: !settings["dashcard.background"],
            "Text--single-row": isSingleRow,
          })}
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
