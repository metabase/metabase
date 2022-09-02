/* eslint-disable react/prop-types */
import React, { Component } from "react";
import styles from "./Text/Text.css";
import "./Image.css";
import cx from "classnames";
import { t } from "ttag";
import querystring from "querystring";
export default class Image extends Component {
  props;
  state;

  constructor(props) {
    super(props);

    this.state = {
      text: "",
      fontSize: 1,
    };
  }

  static uiName = "Image";
  static identifier = "image";
  static iconName = "image";

  static disableSettingsConfig = false;
  static noHeader = true;
  static supportsSeries = false;
  static hidden = true;
  static supportPreviewing = true;

  static minSize = { width: 2, height: 1 };

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
    "dashcard.params": {
      section: t`Display`,
      title: t`URL from query params`,
      dashboard: true,
      widget: "toggle",
      default: false,
    },
  };

  handleTextChange(text) {
    this.props.onUpdateVisualizationSettings({ text: text });
  }

  preventDragging = e => e.stopPropagation();

  renderImage = ({ settings }) => {
    const params = querystring.parse(window.location.search.replace("?", ""));
    if (!settings.text && !settings["dashcard.params"]) {
      return null;
    }
    if (settings["dashcard.params"] && !params) {
      return null;
    }
    return (
      <img
        className="profile-photo"
        src={settings["dashcard.params"] ? params.image : settings.text}
        alt="NFTRover Analytics"
      />
    );
  };

  render() {
    const { className, settings, isEditing } = this.props;
    if (isEditing) {
      return (
        <div className={cx(className, styles.Text)}>
          {this.props.isPreviewing ? (
            <React.Fragment>{this.renderImage({ settings })}</React.Fragment>
          ) : (
            <div className="full flex-full flex flex-column">
              <textarea
                className={cx(
                  "full flex-full flex flex-column bg-light bordered drag-disabled",
                  styles["text-card-textarea"],
                )}
                name="text"
                placeholder={t`${
                  settings["dashcard.params"]
                    ? "In case of query url will always pick from {{image}}"
                    : "Type or paste Image url here"
                }`}
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
                Image
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
          {this.renderImage({ settings })}
        </div>
      );
    }
  }
}
