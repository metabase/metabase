/* eslint-disable react/prop-types */
import React, { Component } from "react";
import styles from "./Text/Text.css";

import cx from "classnames";
import { t } from "ttag";

import ItemVideo from "metabase/dashboard/Recommendations/ItemVideo";

export default class Video extends Component {
  props;
  state;

  constructor(props) {
    super(props);

    this.state = {
      text: "",
      fontSize: 1,
    };
  }

  static uiName = "Video";
  static identifier = "video";
  static iconName = "video";

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
    "dashcard.background": {
      section: t`Display`,
      title: t`Show background`,
      dashboard: true,
      widget: "toggle",
      default: true,
    },
  };

  handleTextChange(text) {
    this.props.onUpdateVisualizationSettings({ text: text });
  }

  preventDragging = e => e.stopPropagation();

  renderVideo = ({ settings }) => {
    if (!settings.text) {
      return null;
    }
    return <ItemVideo item={{ mediaUrl: settings.text }} />;
  };

  render() {
    const { className, settings, isEditing } = this.props;

    if (isEditing) {
      return (
        <div className={cx(className, styles.Text)}>
          {this.props.isPreviewing ? (
            <React.Fragment>{this.renderVideo({ settings })}</React.Fragment>
          ) : (
            <div className="full flex-full flex flex-column">
              <textarea
                className={cx(
                  "full flex-full flex flex-column bg-light bordered drag-disabled",
                  styles["text-card-textarea"],
                )}
                name="text"
                placeholder={t`Type or paste video url here, only YouTube videos are supported now, e.g. https://www.youtube.com/watch?v=yL1o7axk1pg`}
                value={settings.text}
                onChange={e => this.handleTextChange(e.target.value)}
                // Prevents text cards from dragging when you actually want to select text
                // See: https://github.com/metabase/metabase/issues/17039
                onMouseDown={this.preventDragging}
              />
              <span
                className="absolute footprint-secondary-text2"
                style={{ bottom: 10, right: 20 }}
              >
                Video
              </span>
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div
          ref={r => (this.chartRef = r)}
          className={cx(className, styles.Text, {
            /* if the card is not showing a background we should adjust the left
             * padding to help align the titles with the wrapper */
            pl0: !settings["dashcard.background"],
          })}
        >
          {this.renderVideo({ settings })}
        </div>
      );
    }
  }
}
