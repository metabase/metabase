import { createAction } from "@reduxjs/toolkit";
import { t } from "ttag";
import _ from "underscore";

import { Questions } from "metabase/entities/questions";
import {
  DEFAULT_CARD_SIZE,
  GRID_WIDTH,
  getPositionForNewDashCard,
} from "metabase/lib/dashboard_grid";
import { createThunkAction } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { loadMetadataForCard } from "metabase/questions/actions";
import { addUndo } from "metabase/redux/undo";
import { getDefaultSize } from "metabase/visualizations";
import {
  getCardIdsFromColumnValueMappings,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import type {
  Card,
  CardId,
  DashCardId,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  VirtualCard,
  VisualizerVizDefinition,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  trackCardCreated,
  trackDashcardDuplicated,
  trackQuestionReplaced,
  trackSectionAdded,
} from "../analytics";
import type { SectionLayout } from "../sections";
import {
  getCurrentDashcards,
  getDashCardById,
  getDashboard,
  getDashboardId,
  getDashboards,
  getDashcards,
  getSelectedTabId,
} from "../selectors";
import {
  type NewDashboardCard,
  createDashCard,
  createVirtualCard,
  generateTemporaryDashcardId,
  hasInlineParameters,
  isQuestionDashCard,
  isVirtualDashCard,
} from "../utils";

import { showAutoWireToastNewCard } from "./auto-wire-parameters/actions";
import { closeAddCardAutoWireToasts } from "./auto-wire-parameters/toasts";
import {
  ADD_CARD_TO_DASH,
  ADD_MANY_CARDS_TO_DASH,
  REMOVE_CARD_FROM_DASH,
  TRASH_DASHBOARD_QUESTION_FROM_DASH,
  UNDO_REMOVE_CARD_FROM_DASH,
  UNDO_TRASH_DASHBOARD_QUESTION_FROM_DASH,
  setDashCardAttributes,
  setDashboardAttributes,
} from "./core";
import { cancelFetchCardData, fetchCardData } from "./data-fetching";
import {
  duplicateParameters,
  removeParameterAndReferences,
} from "./parameters";
import { getExistingDashCards } from "./utils";

export type NewDashCardOpts = {
  dashId: DashboardId;
  tabId: DashboardTabId | null;
};

export type AddDashCardOpts = NewDashCardOpts & {
  dashcardOverrides: Partial<NewDashboardCard> & {
    card: Card | VirtualCard;
    series?: Card[];
  };
};

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction<DashCardId>(MARK_NEW_CARD_SEEN);

export const addCardToDash = createAction<NewDashboardCard>(ADD_CARD_TO_DASH);
export const addManyCardsToDash = createAction<NewDashboardCard[]>(
  ADD_MANY_CARDS_TO_DASH,
);

export const addDashCardToDashboard =
  ({ dashId, tabId, dashcardOverrides }: AddDashCardOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const display = dashcardOverrides?.card?.display;
    const dashCardSize = display
      ? getDefaultSize(display) || DEFAULT_CARD_SIZE
      : DEFAULT_CARD_SIZE;

    const dashboardState = getState().dashboard;
    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashId,
      tabId,
    );

    const dashcard = createDashCard({
      dashboard_id: dashId,
      dashboard_tab_id: tabId ?? null,

      ...getPositionForNewDashCard(
        dashcards,
        dashCardSize.width,
        dashCardSize.height,
      ),

      ...dashcardOverrides,
    });

    dispatch(addCardToDash(dashcard));

    return dashcard;
  };

export type AddSectionOpts = NewDashCardOpts & {
  sectionLayout: SectionLayout;
};

export const addSectionToDashboard =
  ({ dashId, tabId, sectionLayout }: AddSectionOpts) =>
  (dispatch: Dispatch, getState: GetState) => {
    const dashboardState = getState().dashboard;
    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashId,
      tabId,
    );

    const position = getPositionForNewDashCard(
      dashcards,
      GRID_WIDTH,
      30, // just plenty of vertical space to fit a section
    );

    const sectionDashcards = sectionLayout
      .getLayout(position)
      .map((dashcardOverrides) =>
        createDashCard({
          dashboard_id: dashId,
          dashboard_tab_id: tabId ?? null,
          ...dashcardOverrides,
        }),
      );

    dispatch(addManyCardsToDash(sectionDashcards));
    trackSectionAdded(dashId, sectionLayout.id);
  };

export type AddCardToDashboardOpts = NewDashCardOpts & {
  cardId: CardId;
};

export const addCardToDashboard =
  ({ dashId, tabId, cardId }: AddCardToDashboardOpts) =>
  async (dispatch: Dispatch, getState: GetState) => {
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: cardId })
      .card();

    const dashcardId = generateTemporaryDashcardId();
    const dashcard = dispatch(
      addDashCardToDashboard({
        dashId,
        tabId,
        dashcardOverrides: { id: dashcardId, card, card_id: cardId },
      }),
    ) as DashboardCard;

    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));
    await dispatch(loadMetadataForCard(card));
    dispatch(showAutoWireToastNewCard({ dashcard_id: dashcardId }));
  };

export const addHeadingDashCardToDashboard =
  ({ dashId, tabId }: NewDashCardOpts) =>
  (dispatch: Dispatch) => {
    trackCardCreated("heading", dashId);
    const card = createVirtualCard("heading");
    const dashcardOverrides = {
      card,
      visualization_settings: {
        "dashcard.background": false,
        virtual_card: card,
      },
    };
    dispatch(addDashCardToDashboard({ dashId, tabId, dashcardOverrides }));
  };

export const addMarkdownDashCardToDashboard =
  ({ dashId, tabId }: NewDashCardOpts) =>
  (dispatch: Dispatch) => {
    trackCardCreated("text", dashId);
    const card = createVirtualCard("text");
    const dashcardOverrides = {
      card,
      visualization_settings: { virtual_card: card },
    };
    dispatch(addDashCardToDashboard({ dashId, tabId, dashcardOverrides }));
  };
export const addIFrameDashCardToDashboard =
  ({ dashId, tabId }: NewDashCardOpts) =>
  (dispatch: Dispatch) => {
    const card = createVirtualCard("iframe");
    const dashcardOverrides = {
      card,
      visualization_settings: { virtual_card: card },
    };
    dispatch(addDashCardToDashboard({ dashId, tabId, dashcardOverrides }));
  };

export const addLinkDashCardToDashboard =
  ({ dashId, tabId }: NewDashCardOpts) =>
  (dispatch: Dispatch) => {
    trackCardCreated("link", dashId);
    const card = createVirtualCard("link");
    const dashcardOverrides = {
      card,
      visualization_settings: { virtual_card: card },
    };
    dispatch(addDashCardToDashboard({ dashId, tabId, dashcardOverrides }));
  };

export const replaceCard =
  ({
    dashcardId,
    nextCardId,
  }: {
    dashcardId: DashCardId;
    nextCardId: CardId;
  }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const dashboardId = getDashboardId(getState());

    await dispatch(Questions.actions.fetch({ id: nextCardId }));
    const card = Questions.selectors
      .getObject(getState(), { entityId: nextCardId })
      .card();

    await dispatch(
      setDashCardAttributes({
        id: dashcardId,
        attributes: {
          card,
          card_id: card.id,
          series: [],
          parameter_mappings: [],
          visualization_settings: {},
        },
      }),
    );

    const dashcard = getDashCardById(getState(), dashcardId);

    dispatch(fetchCardData(card, dashcard, { reload: true, clearCache: true }));
    await dispatch(loadMetadataForCard(card));
    dispatch(showAutoWireToastNewCard({ dashcard_id: dashcardId }));

    if (dashboardId) {
      trackQuestionReplaced(dashboardId);
    }
  };

export const addCardWithVisualization =
  ({
    visualization,
    tabId,
  }: {
    visualization: VisualizerVizDefinition;
    tabId: number | null;
  }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const cardIds = getCardIdsFromColumnValueMappings(
      visualization.columnValuesMapping,
    );
    const cards: Card[] = [];

    for (const cardId of cardIds) {
      await dispatch(Questions.actions.fetch({ id: cardId }));
      const card: Card = Questions.selectors
        .getObject(getState(), { entityId: cardId })
        .card();
      cards.push(card);
    }

    const [mainCard, ...secondaryCards] = cards;

    const dashcardId = generateTemporaryDashcardId();
    const dashcard = dispatch(
      addDashCardToDashboard({
        dashId: getState().dashboard.dashboardId!,
        tabId,
        dashcardOverrides: {
          id: dashcardId,
          card: mainCard,
          card_id: mainCard.id,
          series: secondaryCards,
          visualization_settings: {
            visualization,
          },
        },
      }),
    ) as DashboardCard;

    for (const card of cards) {
      dispatch(
        fetchCardData(card, dashcard, { reload: true, clearCache: true }),
      );
      await dispatch(loadMetadataForCard(card));
    }
  };

export const replaceCardWithVisualization =
  ({
    dashcardId,
    visualization,
  }: {
    dashcardId: DashCardId;
    visualization: VisualizerVizDefinition;
  }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const cardIds = getCardIdsFromColumnValueMappings(
      visualization.columnValuesMapping,
    );
    const cards: Card[] = [];

    for (const cardId of cardIds) {
      await dispatch(Questions.actions.fetch({ id: cardId }));
      const card: Card = Questions.selectors
        .getObject(getState(), { entityId: cardId })
        .card();
      cards.push(card);
    }

    const [mainCard, ...secondaryCards] = cards;

    const originalDashCard = getDashCardById(getState(), dashcardId);
    const parameter_mappings = isQuestionDashCard(originalDashCard)
      ? originalDashCard.parameter_mappings
      : [];

    await dispatch(
      setDashCardAttributes({
        id: dashcardId,
        attributes: {
          card_id: mainCard.id,
          card: mainCard,
          series: secondaryCards,
          parameter_mappings,
          visualization_settings: {
            visualization,
          },
        },
      }),
    );
    const dashcard = getDashCardById(getState(), dashcardId);

    for (const card of cards) {
      dispatch(
        fetchCardData(card, dashcard, { reload: true, clearCache: true }),
      );
      await dispatch(loadMetadataForCard(card));
    }
  };

export const DUPLICATE_CARD = "metabase/dashboard/DUPLICATE_CARD";
export const duplicateCard = createThunkAction(
  DUPLICATE_CARD,
  ({ id }: { id: DashCardId }) =>
    (dispatch, getState) => {
      const dashboard = getDashboard(getState());
      const originalDashcard = getDashCardById(getState(), id);
      if (!dashboard || !originalDashcard) {
        throw new Error("Dashboard or original dashcard not found");
      }

      const dashboards = getDashboards(getState());
      const dashcards = getDashcards(getState());
      const tabId = getSelectedTabId(getState());

      const position = getPositionForNewDashCard(
        getExistingDashCards(dashboards, dashcards, dashboard.id, tabId),
        originalDashcard.size_x,
        originalDashcard.size_y,
      );

      const dashcard = {
        ...originalDashcard,
        ...position,
        id: generateTemporaryDashcardId(),
      };

      if (hasInlineParameters(dashcard)) {
        const originalParameterIds = [...dashcard.inline_parameters];
        const newParameters = duplicateParameters(
          dispatch,
          getState,
          dashcard.inline_parameters,
        );
        dashcard.inline_parameters = newParameters.map(
          (parameter) => parameter.id,
        );
        if (Array.isArray(dashcard.parameter_mappings)) {
          dashcard.parameter_mappings = dashcard.parameter_mappings.map(
            (mapping) => {
              const inlineParameterIndex = originalParameterIds.indexOf(
                mapping.parameter_id,
              );
              if (inlineParameterIndex !== -1) {
                return {
                  ...mapping,
                  parameter_id: newParameters[inlineParameterIndex].id,
                };
              }
              return mapping;
            },
          );
        }
      }

      dispatch(
        addDashCardToDashboard({
          dashId: dashboard.id,
          dashcardOverrides: dashcard,
          tabId,
        }),
      );

      if (!isVirtualDashCard(dashcard)) {
        dispatch(fetchCardData(dashcard.card, dashcard));

        if (
          (isQuestionDashCard(dashcard) ||
            isVisualizerDashboardCard(dashcard)) &&
          dashcard.series &&
          dashcard.series.length > 0
        ) {
          dashcard.series.forEach((card) => {
            dispatch(fetchCardData(card, dashcard));
          });
        }
      }

      trackDashcardDuplicated(dashboard.id);
    },
);

export const removeCardFromDashboard = createThunkAction(
  REMOVE_CARD_FROM_DASH,
  ({
    dashcardId,
    cardId,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
  }) =>
    (dispatch, getState) => {
      const dashboard = checkNotNull(getDashboard(getState()));
      const dashcards = getCurrentDashcards(getState());
      const dashcard = getDashCardById(getState(), dashcardId);

      const originalParameters = dashboard.parameters
        ? [...dashboard.parameters]
        : dashboard.parameters;

      dispatch(closeAddCardAutoWireToasts());
      dispatch(cancelFetchCardData(cardId, dashcardId));
      if (hasInlineParameters(dashcard)) {
        dashcard.inline_parameters.forEach((parameterId) => {
          removeParameterAndReferences(dispatch, getState, parameterId);
        });
      }

      const dashcardCountByCardId = _.countBy(dashcards, "card_id");
      const isLastDashboardQuestionDashcard = Boolean(
        dashcard.card_id &&
          dashcard.card.dashboard_id !== null &&
          dashcardCountByCardId[dashcard.card_id] <= 1,
      );
      dispatch(
        addUndo({
          message: isLastDashboardQuestionDashcard
            ? t`Trashed and removed card`
            : t`Removed card`,
          undo: true,
          action: () =>
            dispatch(
              undoRemoveCardFromDashboard({
                dashcardId,
                originalParameters: hasInlineParameters(dashcard)
                  ? originalParameters
                  : undefined,
              }),
            ),
        }),
      );

      return { dashcardId };
    },
);

const undoRemoveCardFromDashboard = createThunkAction(
  UNDO_REMOVE_CARD_FROM_DASH,
  ({ dashcardId, originalParameters }) =>
    (dispatch, getState) => {
      const dashboardId = checkNotNull(getDashboardId(getState()));
      const dashcard = getDashCardById(getState(), dashcardId);

      if (originalParameters) {
        dispatch(
          setDashboardAttributes({
            id: dashboardId,
            attributes: {
              parameters: originalParameters,
            },
          }),
        );
      }

      if (!isVirtualDashCard(dashcard)) {
        const card = dashcard.card;
        dispatch(fetchCardData(card, dashcard));
      }

      return { dashcardId };
    },
);

export const trashDashboardQuestion = createThunkAction(
  TRASH_DASHBOARD_QUESTION_FROM_DASH,
  ({
    dashcardId,
    cardId,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
  }) =>
    async (dispatch) => {
      await dispatch(
        Questions.actions.setArchived({ id: cardId }, true, {
          notify: {
            action: () =>
              dispatch(undoTrashDashboardQuestion({ dashcardId, cardId })),
            undo: false,
          },
        }),
      );
      dispatch(removeCardFromDashboard({ dashcardId, cardId }));
    },
);

const undoTrashDashboardQuestion = createThunkAction(
  UNDO_TRASH_DASHBOARD_QUESTION_FROM_DASH,
  ({
    dashcardId,
    cardId,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
  }) =>
    async (dispatch) => {
      await dispatch(
        Questions.actions.setArchived({ id: cardId }, false, {
          notify: {
            action: () =>
              dispatch(trashDashboardQuestion({ dashcardId, cardId })),
            undo: false,
          },
        }),
      );
      dispatch(undoRemoveCardFromDashboard({ dashcardId }));
    },
);
