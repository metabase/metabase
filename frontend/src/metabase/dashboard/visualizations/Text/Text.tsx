import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, {
  type Options,
  defaultUrlTransform,
} from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { updateParameterMappingsForDashcardText } from "metabase/dashboard/actions";
import { getParameterValues } from "metabase/dashboard/selectors";
import { fillParametersInText } from "metabase/dashboard/visualizations/parameter-substitution";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Flex } from "metabase/ui";
import { isEmpty } from "metabase/utils/validate";
import {
  DATA_IMAGE_URI_PATTERN,
  type VisualizationGridSize,
} from "metabase/viz-core";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./Text.module.css";

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

function urlTransform(url: string): string {
  if (DATA_IMAGE_URI_PATTERN.test(url)) {
    return url;
  }
  return defaultUrlTransform(url);
}

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
  const isCompact = isSingleRow && !isMobile;
  const isFluid = dashboard?.width !== "fixed";

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

  const wrapperClassName = cx(
    S.root,
    CS.overflowHidden,
    {
      [S.compact]: isCompact,
      [S.fluid]: isFluid,
      [S.editing]: isEditing,
      [DashboardS.DashCardEditOutline]: isEditing,
      [S.empty]: isEditing && !hasContent,
    },
    className,
  );

  const isTyping = isEditing && !isPreviewing;

  return (
    <Flex
      className={wrapperClassName}
      data-testid={isEditing ? "editing-dashboard-text-container" : undefined}
      direction="column"
      justify="center"
      w="100%"
      h="100%"
      onClick={isEditing ? toggleFocusOn : undefined}
    >
      {isTyping ? (
        <Box
          component="textarea"
          className={cx(S.input, { [S.inputCompact]: isCompact })}
          data-testid="editing-dashboard-text-input"
          name="text"
          w="100%"
          mah="100%"
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
        />
      ) : (
        <Box
          className={S.markdown}
          data-testid={isEditing ? "editing-dashboard-text-preview" : undefined}
          w="100%"
          h="100%"
          pl="xxxs"
          onMouseDown={isEditing ? preventDragging : undefined}
        >
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            urlTransform={urlTransform}
            className={cx(
              CS.full,
              CS.flexFull,
              CS.flex,
              CS.flexColumn,
              "text-card-markdown",
              { "cursor-text": isEditing },
              getSettingsStyle(settings),
            )}
          >
            {isEditing ? (hasContent ? settingsText : placeholder) : content}
          </ReactMarkdown>
        </Box>
      )}
    </Flex>
  );
}
