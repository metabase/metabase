/* eslint-disable react/prop-types */
import { Component } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeExternalLinks from "rehype-external-links";

import _ from "underscore";
import cx from "classnames";
import { t } from "ttag";

import { substitute_tags } from "cljs/metabase.shared.parameters.parameters";
import { withInstanceLanguage, siteLocale } from "metabase/lib/i18n";

import styles from "./Text.css";

const getSettingsStyle = settings => ({
  "align-center": settings["text.align_horizontal"] === "center",
  "align-end": settings["text.align_horizontal"] === "right",
  "justify-center": settings["text.align_vertical"] === "middle",
  "justify-end": settings["text.align_vertical"] === "bottom",
});

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [
  [rehypeExternalLinks, { rel: ["noreferrer"], target: "_blank" }],
];

export default class Text extends Component {
  constructor(props) {
    super(props);

    this.state = {
      text: "",
    };
  }

  static uiName = "Text";
  static identifier = "text";
  static iconName = "text";
  static canSavePng = false;

  static disableSettingsConfig = false;
  static noHeader = true;
  static supportsSeries = false;
  static hidden = true;
  static supportPreviewing = true;

  static minSize = { width: 1, height: 1 };
  static defaultSize = { width: 4, height: 4 };

  static checkRenderable() {
    // text can always be rendered, nothing needed here
  }

  static settings = {
    "card.title": {
      dashboard: false,
      default: t`Text card`,
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
      inline: true,
      widget: "toggle",
      default: true,
    },
  };

  handleTextChange(text) {
    this.props.onUpdateVisualizationSettings({ text: text });
  }

  preventDragging = e => e.stopPropagation();

  render() {
    const {
      className,
      dashboard,
      dashcard,
      gridSize,
      settings,
      isEditing,
      isPreviewing,
      parameterValues,
    } = this.props;
    const isSingleRow = gridSize && gridSize.height === 1;

    let parametersByTag = {};
    if (dashcard && dashcard.parameter_mappings) {
      parametersByTag = dashcard.parameter_mappings.reduce((acc, mapping) => {
        const tagId = mapping.target[1];
        const parameter = dashboard.parameters.find(
          p => p.id === mapping.parameter_id,
        );
        if (parameter) {
          const parameterValue = parameterValues[parameter.id];
          return {
            ...acc,
            [tagId]: { ...parameter, value: parameterValue },
          };
        } else {
          return acc;
        }
      }, {});
    }

    let content = settings["text"];
    if (!_.isEmpty(parametersByTag)) {
      // Temporarily override language to use site language, so that all viewers of a dashboard see parameter values
      // translated the same way.
      content = withInstanceLanguage(() =>
        substitute_tags(content, parametersByTag, siteLocale()),
      );
    }

    if (isEditing) {
      return (
        <div
          className={cx(className, styles.Text, {
            [styles.padded]: !isPreviewing,
          })}
        >
          {isPreviewing ? (
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              className={cx(
                "full flex-full flex flex-column text-card-markdown",
                styles["text-card-markdown"],
                getSettingsStyle(settings),
              )}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <textarea
              className={cx(
                "full flex-full flex flex-column bg-light bordered drag-disabled",
                styles["text-card-textarea"],
              )}
              name="text"
              placeholder={t`You can use Markdown here, and include variables {{like_this}}`}
              value={settings.text}
              onChange={e => this.handleTextChange(e.target.value)}
              // Prevents text cards from dragging when you actually want to select text
              // See: https://github.com/metabase/metabase/issues/17039
              onMouseDown={this.preventDragging}
            />
          )}
        </div>
      );
    }

    return (
      <div
        className={cx(className, styles.Text, {
          // if the card is not showing a background
          // we should adjust the left padding
          // to help align the titles with the wrapper
          pl0: !settings["dashcard.background"],
          "Text--single-row": isSingleRow,
        })}
      >
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          className={cx(
            "full flex-full flex flex-column text-card-markdown",
            styles["text-card-markdown"],
            getSettingsStyle(settings),
          )}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
}
