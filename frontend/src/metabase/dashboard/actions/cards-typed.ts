import { createAction } from "@reduxjs/toolkit";

import { datasetApi, tableApi } from "metabase/api";
import Questions from "metabase/entities/questions";
import {
  DEFAULT_CARD_SIZE,
  GRID_WIDTH,
  getPositionForNewDashCard,
} from "metabase/lib/dashboard_grid";
import {
  type DispatchFn as Dispatch,
  createThunkAction,
} from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
import {
  loadMetadataForCard,
  loadMetadataForTable,
} from "metabase/questions/actions";
import { getDefaultSize } from "metabase/visualizations";
import { getCardIdsFromColumnValueMappings } from "metabase/visualizer/utils";
import type {
  Card,
  CardId,
  DashCardId,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  DatabaseId,
  TableId,
  VirtualCard,
  VirtualCardDisplay,
  VisualizerVizDefinition,
} from "metabase-types/api";
import type { GetState } from "metabase-types/store";

import {
  trackCardCreated,
  trackQuestionReplaced,
  trackSectionAdded,
} from "../analytics";
import type { SectionLayout } from "../sections";
import { getDashCardById, getDashboardId } from "../selectors";
import {
  type NewDashboardCard,
  createDashCard,
  createVirtualCard,
  generateTemporaryDashcardId,
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
} from "./core";
import {
  cancelFetchCardData,
  fetchCardData,
  setEditingDashcardData,
} from "./data-fetching";
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

export type AddEditableTableDashCardToDashboardOpts = NewDashCardOpts & {
  tableId: TableId;
  databaseId: DatabaseId;
};

export const addEditableTableDashCardToDashboard =
  ({
    dashId,
    tabId,
    tableId,
    databaseId,
  }: AddEditableTableDashCardToDashboardOpts) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const tempId = generateTemporaryDashcardId();

    // this should work as a virtual card until dashboard is saved, then it becomes a normal card. Hence the typecast
    const card = createVirtualCard("table-editable" as VirtualCardDisplay);

    dispatch(
      addDashCardToDashboard({
        dashId,
        tabId,
        dashcardOverrides: {
          id: tempId,
          card: {
            ...card,
            table_id: tableId,
            database_id: databaseId,
            id: tempId,
          } as VirtualCard,
          visualization_settings: {
            table_id: tableId,
            "editableTable.enabledActions": [
              {
                id: uuid(),
                actionId: "data-grid.row/create",
                enabled: true,
                actionType: "data-grid/built-in",
              },
              {
                id: uuid(),
                actionId: "data-grid.row/update",
                enabled: true,
                actionType: "data-grid/built-in",
              },
              {
                id: uuid(),
                actionId: "data-grid.row/delete",
                enabled: true,
                actionType: "data-grid/built-in",
              },
            ],
          },
        },
      }),
    );

    await dispatch(loadMetadataForTable(tableId));

    const tableMetadataSelector =
      tableApi.endpoints.getTableQueryMetadata.select({
        id: tableId,
      });

    // We do not have types for RTK redux store, so we need to cast to unknown
    const tableMetadataQueryCache = tableMetadataSelector(
      getState() as unknown as Parameters<typeof tableMetadataSelector>[0],
    );

    if (tableMetadataQueryCache.data) {
      const { display_name, db_id, fields } = tableMetadataQueryCache.data;

      dispatch(
        updateEditableTableCardQueryInEditMode({
          dashcardId: tempId,
          cardId: tempId,
          newCard: {
            ...card,
            id: tempId,
            table_id: Number(tableId),
            name: `${display_name} (unsaved)`,
            dataset_query: {
              type: "query",
              query: { "source-table": tableId },
              database: db_id,
            },
            database_id: db_id,
            result_metadata: fields,
          } as Card,
        }),
      );
    }
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

    dispatch(
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

export const removeCardFromDashboard = createThunkAction(
  REMOVE_CARD_FROM_DASH,
  ({
    dashcardId,
    cardId,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
  }) =>
    (dispatch) => {
      dispatch(closeAddCardAutoWireToasts());

      dispatch(cancelFetchCardData(cardId, dashcardId));
      return { dashcardId };
    },
);

export const undoRemoveCardFromDashboard = createThunkAction(
  UNDO_REMOVE_CARD_FROM_DASH,
  ({ dashcardId }) =>
    (dispatch, getState) => {
      const dashcard = getDashCardById(getState(), dashcardId);

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

export const UPDATE_EDITABLE_TABLE_CARD_QUERY_IN_EDIT_MODE =
  "metabase/dashboard/UPDATE_EDITABLE_TABLE_CARD_QUERY_IN_EDIT_MODE";
export const updateEditableTableCardQueryInEditMode = createThunkAction(
  UPDATE_EDITABLE_TABLE_CARD_QUERY_IN_EDIT_MODE,
  ({
    dashcardId,
    cardId,
    newCard,
  }: {
    dashcardId: DashCardId;
    cardId: DashboardCard["card_id"];
    newCard: Card;
  }) =>
    async (dispatch: Dispatch, getState: GetState) => {
      // set data override to null to show loading state
      dispatch(setEditingDashcardData(dashcardId, cardId, null));

      const dashcard = getDashCardById(getState(), dashcardId);
      const isSavedDashcard = dashcard.id > 0;

      // Non-saved cards (temporary ID < 0) do not require sync with the server, since there's no card ID to update.
      // The `isDirty` flag is used to determine if the existing card local state is different from the server state.
      const isDirty = isSavedDashcard ? true : false;
      const card: Card = {
        ...newCard,
        // @ts-expect-error - we don't have a type for Store card with additional state
        isDirty,
      };

      const newDashcardAttributes: Partial<DashboardCard> = { card };

      // For new cards we also need to copy card dataset_query to dashcard visualization_settings
      // To preserve edited filters upon saving the dashboard and creating a new card
      if (!isSavedDashcard) {
        newDashcardAttributes.visualization_settings = {
          ...dashcard.visualization_settings,
          initial_dataset_query: newCard.dataset_query,
          "table.editableColumns": newCard.result_metadata.map(
            (field) => field.name,
          ),
        };
      }

      dispatch(
        setDashCardAttributes({
          id: dashcardId,
          attributes: newDashcardAttributes,
        }),
      );

      // NOTE: we cannot do data loading inside an action, as we don't support ad-hoc queries as a dashcard
      const action = dispatch(
        // TODO: set "dashboard" context for api request ?
        datasetApi.endpoints.getAdhocQuery.initiate(newCard.dataset_query),
      );
      const cardData = await action.unwrap();

      dispatch(setEditingDashcardData(dashcardId, cardId, cardData));
    },
);
