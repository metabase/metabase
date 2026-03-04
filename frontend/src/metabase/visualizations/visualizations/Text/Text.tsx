import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { updateParameterMappingsForDashcardText } from "metabase/dashboard/actions";
import { getParameterValues } from "metabase/dashboard/selectors";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
import type { VisualizationGridSize } from "metabase/visualizations/types";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  DisplayContainer,
  EditModeContainer,
  ReactMarkdownStyleWrapper,
  TextInput,
} from "./Text.styled";

type TextProps = {
  onUpdateVisualizationSettings?: (settings: VisualizationSettings) => void;
  className?: string;
  dashboard?: Dashboard;
  dashcard?: VirtualDashboardCard;
  gridSize?: VisualizationGridSize;
  settings?: VisualizationSettings;
  isEditing?: boolean;
  isMobile?: boolean;
};

const getSettingsStyle = (
  settings: VisualizationSettings,
): Record<string, boolean> => ({
  [CS.textCentered]: settings["text.align_horizontal"] === "center",
  [CS.textRight]: settings["text.align_horizontal"] === "right",
  [CS.justifyCenter]: settings["text.align_vertical"] === "middle",
  [CS.justifyEnd]: settings["text.align_vertical"] === "bottom",
});

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: Options["rehypePlugins"] = [
  [rehypeExternalLinks, { rel: ["noreferrer"], target: "_blank" }],
];

export function Text({
  onUpdateVisualizationSettings,
  className,
  dashboard,
  dashcard,
  gridSize,
  settings = {},
  isEditing = false,
  isMobile = false,
}: TextProps) {
  const dispatch = useDispatch();
  const parameterValues = useSelector(getParameterValues);
  const settingsText = typeof settings.text === "string" ? settings.text : "";

  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);
  const [textValue, setTextValue] = useState(settingsText);

  const tc = useTranslateContent();
  const translatedText = tc(settingsText);

  const [isFocused, { open: toggleFocusOn, close: toggleFocusOff }] =
    useDisclosure(justAdded);
  const isPreviewing = !isFocused;

  const preventDragging = (e: React.MouseEvent) => e.stopPropagation();

  const isSingleRow = gridSize?.height === 1;

  useEffect(() => {
    setTextValue(settingsText);
  }, [settingsText]);

  const content = useMemo(
    () =>
      dashboard
        ? fillParametersInText({
            dashcard,
            dashboard,
            parameterValues,
            text: translatedText,
            escapeMarkdown: true,
          })
        : translatedText,
    [dashcard, dashboard, parameterValues, translatedText],
  );

  const updateParameterMappings = useCallback(() => {
    if (typeof dashcard?.id !== "number") {
      return;
    }

    dispatch(updateParameterMappingsForDashcardText(dashcard.id));
  }, [dashcard, dispatch]);

  const hasContent = !isEmpty(settingsText);
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
              {hasContent ? settingsText : placeholder}
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

              if (settingsText !== textValue) {
                onUpdateVisualizationSettings?.({ text: textValue });
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
          className={cx(
            CS.full,
            CS.flexFull,
            CS.flex,
            CS.flexColumn,
            "text-card-markdown",
            getSettingsStyle(settings),
          )}
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
        >
          {content}
        </ReactMarkdown>
      </ReactMarkdownStyleWrapper>
    </DisplayContainer>
  );
}
