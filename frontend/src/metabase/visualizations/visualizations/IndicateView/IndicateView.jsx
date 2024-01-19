/* eslint-disable react/prop-types */
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeExternalLinks from "rehype-external-links";
import cx from "classnames";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { isEmpty } from "metabase/lib/validate";

import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";

import {
  DisplayContainer,
  EditModeContainer,
  ReactMarkdownStyleWrapper,
  TextInput,
} from "./IndicateView.styled";
import { removeCardFromDashboard, addCardToDashboard } from "metabase/dashboard/actions";
import { useDispatch } from "react-redux";

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


export function IndicateView({
  onUpdateVisualizationSettings,
  className,
  dashboard,
  dashcard,
  gridSize,
  settings,
  isEditing,
  parameterValues,
  isMobile,
}) {
  const justAdded = useMemo(() => dashcard?.justAdded || false, [dashcard]);
  const dispatch = useDispatch();

  const [isFocused, { turnOn: toggleFocusOn, turnOff: toggleFocusOff }] =
    useToggle(justAdded);
  const isPreviewing = !isFocused;

  const handleTextChange = text => onUpdateVisualizationSettings({ text });
  const preventDragging = e => e.stopPropagation();

  const isSingleRow = gridSize?.height === 1;

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


  const handleReplaceDashCard = () => {
    const _dashCard = findMaxSizeDashcard(dashboard);
    dispatch(removeCardFromDashboard({
      dashcardId: _dashCard.id,
      cardId: _dashCard.cardId
    }));
    dispatch(addCardToDashboard({
      dashId: dashboard.id,
      cardId:settings['change.cardId'],
      tabId:null
    }));
    console.log(1);
  }

  const findMaxSizeDashcard = (dashboard) => {
    let _maxSize = 0;
    let _maxSizeDashcard = null;
    for(let i =0 ; i<dashboard.dashcards.length; i++) {
      let _dashcard = dashboard.dashcards[i];
      if(_dashcard.size_x > _maxSize) {
        _maxSize = _dashcard.size_x;
        _maxSizeDashcard = _dashcard;
      }
    }
    return _maxSizeDashcard;
  }

  
  

  // const handleReplaceDashCard = useCallback(
  //     cardId => {
  //       addCardToDashboard({
  //         dashId: 1,
  //         cardId: 1,
  //         tabId: null,
  //       });
  //       MetabaseAnalytics.trackStructEvent("Dashboard", "Add Card");
  //     }
  // );

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
                "full flex-full flex flex-column text-card-markdown cursor-text",
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
            value={settings.text}
            autoFocus={justAdded || isFocused}
            onChange={e => handleTextChange(e.target.value)}
            onMouseDown={preventDragging}
            onBlur={toggleFocusOff}
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
      onClick={handleReplaceDashCard}
    >
      <ReactMarkdownStyleWrapper>
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          className={cx(
            "full flex-full flex flex-column text-card-markdown",
            getSettingsStyle(settings),
          )}
        >
          {content}
        </ReactMarkdown>
      </ReactMarkdownStyleWrapper>
    </DisplayContainer>
  );
}
