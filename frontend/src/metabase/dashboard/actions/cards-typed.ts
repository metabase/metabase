import Questions from "metabase/entities/questions";
import {
  DEFAULT_CARD_SIZE,
  GRID_WIDTH,
  getPositionForNewDashCard,
} from "metabase/lib/dashboard_grid";
import { createAction, createThunkAction } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getDefaultSize } from "metabase/visualizations";
import type {
  Card,
  CardId,
  DashCardId,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  VirtualCard,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  trackCardCreated,
  trackQuestionReplaced,
  trackSectionAdded,
} from "../analytics";
import type { SectionLayout } from "../sections";
import { getDashCardById, getDashboardId } from "../selectors";
import {
  createDashCard,
  createVirtualCard,
  generateTemporaryDashcardId,
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
} from "./core";
import { cancelFetchCardData, fetchCardData } from "./data-fetching";
import { getExistingDashCards } from "./utils";

export type NewDashCardOpts = {
  dashId: DashboardId;
  tabId: DashboardTabId | null;
};

type NewDashboardCard = Omit<
  DashboardCard,
  "entity_id" | "created_at" | "updated_at"
>;

export type AddDashCardOpts = NewDashCardOpts & {
  dashcardOverrides: Partial<NewDashboardCard> & {
    card: Card | VirtualCard;
  };
};

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

const _addDashCard = createAction<NewDashboardCard>(ADD_CARD_TO_DASH);
const _addManyDashCards = createAction<NewDashboardCard[]>(
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

    dispatch(_addDashCard(dashcard));

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
      .map(dashcardOverrides =>
        createDashCard({
          dashboard_id: dashId,
          dashboard_tab_id: tabId ?? null,
          ...dashcardOverrides,
        }),
      );

    dispatch(_addManyDashCards(sectionDashcards));
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
    );

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

    dashboardId && trackQuestionReplaced(dashboardId);
  };

export const removeCardFromDashboard = createThunkAction(
  REMOVE_CARD_FROM_DASH,
  ({
    dashcardId,
    cardId,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
  }) =>
    dispatch => {
      dispatch(closeAddCardAutoWireToasts());

      // @ts-expect-error — data-fetching.js actions must be converted to TypeScript
      dispatch(cancelFetchCardData(cardId, dashcardId));
      return { dashcardId };
    },
);

export const undoRemoveCardFromDashboard = createThunkAction(
  UNDO_REMOVE_CARD_FROM_DASH,
  ({ dashcardId }) =>
    (dispatch, getState) => {
      const dashcard = getDashCardById(getState(), dashcardId);
      const card = dashcard.card;

      if (!isVirtualDashCard(dashcard)) {
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
    async dispatch => {
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
    async dispatch => {
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
