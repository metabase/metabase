/* eslint-disable react/prop-types */
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { updateParameterMappingsForDashcardText } from "metabase/dashboard/actions";
import { getParameterValues } from "metabase/dashboard/selectors";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";

import {
  DisplayContainer,
  EditModeContainer,
  ReactMarkdownStyleWrapper,
  TextInput,
} from "./Text.styled";

const getSettingsStyle = (settings) => ({
  [CS.textCentered]: settings["text.align_horizontal"] === "center",
  [CS.textRight]: settings["text.align_horizontal"] === "right",
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
  const dispatch = useDispatch();
  const parameterValues = useSelector(getParameterValues);
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);
  const [textValue, setTextValue] = useState(settings.text);

  const tc = useTranslateContent();
  const translatedText = tc(settings.text);

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const preventDragging = (e) => e.stopPropagation();

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
        text: translatedText,
        escapeMarkdown: true,
      }),
    [dashcard, dashboard, parameterValues, translatedText],
  );

  const updateParameterMappings = useCallback(() => {
    if (!dashcard.id) {
      return;
    }

    dispatch(updateParameterMappingsForDashcardText(dashcard?.id));
  }, [dashcard?.id, dispatch]);

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
        isFixedWidth={dashboard?.width === "fixed"}
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
            onChange={(e) => setTextValue(e.target.value)}
            onMouseDown={preventDragging}
            onBlur={() => {
              toggleFocusOff();

              if (settings.text !== textValue) {
                onUpdateVisualizationSettings({ text: textValue });
                updateParameterMappings();
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
      isFixedWidth={dashboard?.width === "fixed"}
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
