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
// import { useCallback } from "react";
// import * as MetabaseAnalytics from "metabase/lib/analytics";
// import PropTypes from "prop-types";
import { getVisualizationRaw } from "metabase/visualizations";
import Questions from "metabase/entities/questions";
// import { cancelFetchCardData, fetchCardData } from "./data-fetching";
import { ADD_CARD_TO_DASH, addCardToDashboard } from "metabase/dashboard/actions";
import { autoWireParametersToNewCard } from "metabase/dashboard/actions/auto-wire-parameters/actions";

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

export const handleReplaceDashCard =  ()=>{
  debugger
  addCardToDashboard()
}
export const addCardToDashboard =
  ({ dashId, cardId, tabId }) =>
  async (dispatch, getState) => {
    debugger
    console.log(`dashId: ${dashId}`);
    console.log(`cardId: ${cardId}`);
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: cardId })
      .card();
    const visualization = getVisualizationRaw([{ card }]);
    const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;

    const dashboardState = getState().dashboard;

    const dashcardId = generateTemporaryDashcardId();
    const dashcard = {
      id: dashcardId,
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,
      card_id: card.id,
      card: card,
      series: [],
      ...getPositionForNewDashCard(
        getExistingDashCards(
          dashboardState.dashboards,
          dashboardState.dashcards,
          dashId,
          tabId,
        ),
        createdCardSize.width,
        createdCardSize.height,
      ),
      parameter_mappings: [],
      visualization_settings: {},
    };
    dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));

    await dispatch(loadMetadataForDashboard([dashcard]));

    dispatch(
      autoWireParametersToNewCard({
        dashboard_id: dashId,
        dashcard_id: dashcardId,
      }),
    );
  };
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

  let tempId = -1;
      
  function generateTemporaryDashcardId() {
    return tempId--;
  }

  // const handleReplaceDashCard = (dashId=1, cardId =1, tabId = null) => 
  //   async (dispatch, getState) => {
  //     debugger
  //     console.log(`dashId: ${dashId}//////`);
  //     console.log(`cardId: ${cardId}`);
  //     await dispatch(Questions.actions.fetch({ id: cardId }));
  //     const card = Questions.selectors
  //       .getObject(getState(), { entityId: cardId })
  //       .card();
  //     const visualization = getVisualizationRaw([{ card }]);
  //     const createdCardSize = visualization.defaultSize || DEFAULT_CARD_SIZE;
  
  //     const dashboardState = getState().dashboard;
  
  //     const dashcardId = generateTemporaryDashcardId();
  //     const dashcard = {
  //       // id: dashcardId,
  //       // dashboard_id: dashId,
  //       // dashboard_tab_id: tabId ?? null,
  //       // card_id: card.id,
  //       // card: card,
  //       // series: [],
  //       // ...getPositionForNewDashCard(
  //       //   getExistingDashCards(
  //       //     dashboardState.dashboards,
  //       //     dashboardState.dashcards,
  //       //     dashId,
  //       //     tabId,
  //       //   ),
  //       //   createdCardSize.width,
  //       //   createdCardSize.height,
  //       // ),
  //       // parameter_mappings: [],
  //       // visualization_settings: {},
  //     };
  //     dispatch(createAction(ADD_CARD_TO_DASH)(dashcard));
  //     dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));
  
  //     await dispatch(loadMetadataForDashboard([dashcard]));
  
  //     dispatch(
  //       autoWireParametersToNewCard({
  //         dashboard_id: dashId,
  //         dashcard_id: dashcardId,
  //       }),
  //     );
  //   };
  
  

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
