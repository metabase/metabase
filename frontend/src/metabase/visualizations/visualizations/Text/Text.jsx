/* eslint-disable react/prop-types */
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeExternalLinks from "rehype-external-links";

import _ from "underscore";
import cx from "classnames";
import { t } from "ttag";

import { substitute_tags } from "cljs/metabase.shared.parameters.parameters";
import { withInstanceLanguage, siteLocale } from "metabase/lib/i18n";

import { useFocus } from "metabase/hooks/use-focus";

import {
  DisplayContainer,
  EditModeContainer,
  TextInput,
} from "./Text.styled.jsx";

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

export function Text({
  onUpdateVisualizationSettings,
  className,
  dashboard,
  dashcard,
  gridSize,
  settings,
  isEditing,
  parameterValues,
}) {
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);

  const { isFocused, toggleFocusOn, toggleFocusOff } = useFocus(justAdded);
  const isPreviewing = !isFocused;

  const handleTextChange = text =>
    onUpdateVisualizationSettings({ text: text });
  const preventDragging = e => e.stopPropagation();

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

  const hasNoContent = !content;
  const placeholder = t`You can use Markdown here, and include variables {{like_this}}`;

  if (isEditing) {
    return (
      <EditModeContainer
        className={cx(className, "text-edit-container", {
          "has-no-content": hasNoContent,
        })}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
      >
        {isPreviewing ? (
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            className={cx(
              "full flex-full flex flex-column text-card-markdown",
              styles["text-card-markdown"],
              styles["cursor-text"],
              getSettingsStyle(settings),
              {
                "text-light": hasNoContent,
              },
            )}
          >
            {content || placeholder}
          </ReactMarkdown>
        ) : (
          <TextInput
            name="text"
            placeholder={placeholder}
            value={content}
            autoFocus={justAdded || isFocused}
            onChange={e => handleTextChange(e.target.value)}
            onMouseDown={preventDragging}
            onBlur={toggleFocusOff}
          />
        )}
      </EditModeContainer>
    );
  }

  return (
    <DisplayContainer className={cx(className)} isSingleRow={isSingleRow}>
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
    </DisplayContainer>
  );
}
