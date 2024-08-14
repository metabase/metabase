/* eslint-disable react/prop-types */
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getParameterValues } from "metabase/dashboard/selectors";
import { useToggle } from "metabase/hooks/use-toggle";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";

import {
  DisplayContainer,
  EditModeContainer,
  ReactMarkdownStyleWrapper,
  TextInput,
} from "./Text.styled";

const getSettingsStyle = settings => ({
  [CS.alignCenter]: settings["text.align_horizontal"] === "center",
  [CS.alignStart]: settings["text.align_horizontal"] === "right",
  [CS.justifyCenter]: settings["text.align_vertical"] === "middle",
  [CS.justifyEnd]: settings["text.align_vertical"] === "bottom",
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
  isMobile,
}) {
  const parameterValues = useSelector(getParameterValues);
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);
  const [textValue, setTextValue] = useState(settings.text);

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const preventDragging = e => e.stopPropagation();

  const isSingleRow = gridSize?.height === 1;

  // handles a case when settings are updated externally
  useEffect(() => {
    setTextValue(settings.text);
  }, [settings.text]);

  const content = useMemo(
    () =>
      fillParametersInText({
        dashcard,
        dashboard,
        parameterValues,
        text: settings.text,
        escapeMarkdown: true,
      }),
    [dashcard, dashboard, parameterValues, settings.text],
  );

  const hasContent = !isEmpty(settings.text);
  const placeholder = t`You can use Markdown here, and include variables {{like_this}}`;

  if (isEditing) {
    return (
      <EditModeContainer
        data-testid="editing-dashboard-text-container"
        className={cx(className)}
        isEmpty={!hasContent}
        isPreviewing={isPreviewing}
        onClick={toggleFocusOn}
        isSingleRow={isSingleRow}
        isMobile={isMobile}
      >
        {isPreviewing ? (
          <ReactMarkdownStyleWrapper
            data-testid="editing-dashboard-text-preview"
            onMouseDown={preventDragging}
          >
            {/* ReactMarkdown does not allow adding an onMouseDown event handler */}
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              className={cx(
                CS.full,
                CS.flexFull,
                CS.flex,
                CS.flexColumn,
                "text-card-markdown",
                "cursor-text",
                getSettingsStyle(settings),
              )}
            >
              {hasContent ? settings.text : placeholder}
            </ReactMarkdown>
          </ReactMarkdownStyleWrapper>
        ) : (
          <TextInput
            data-testid="editing-dashboard-text-input"
            name="text"
            placeholder={placeholder}
            value={textValue}
            autoFocus={justAdded || isFocused}
            onChange={e => setTextValue(e.target.value)}
            onMouseDown={preventDragging}
            onBlur={() => {
              toggleFocusOff();

              if (settings.text !== textValue) {
                onUpdateVisualizationSettings({ text: textValue });
              }
            }}
            isMobile={isMobile}
            isSingleRow={isSingleRow}
          />
        )}
      </EditModeContainer>
    );
  }

  return (
    <DisplayContainer
      className={cx(className)}
      isSingleRow={isSingleRow}
      isMobile={isMobile}
    >
      <ReactMarkdownStyleWrapper>
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          className={cx(
            CS.full,
            CS.flexFull,
            CS.flex,
            CS.flexColumn,
            "text-card-markdown",
            getSettingsStyle(settings),
          )}
        >
          {content}
        </ReactMarkdown>
      </ReactMarkdownStyleWrapper>
    </DisplayContainer>
  );
}
