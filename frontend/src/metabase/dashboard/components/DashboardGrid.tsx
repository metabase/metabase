import { useDisclosure, usePrevious } from "@mantine/hooks";
import cx from "classnames";
import type { ComponentType, ForwardedRef, Ref } from "react";
import {
  Component,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ConnectedProps } from "react-redux";
import { push } from "react-router-redux";
import { useMount, useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import ModalS from "metabase/css/components/modal.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import {
  getVisibleCardIds,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import {
  GRID_ASPECT_RATIO,
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  GRID_WIDTH,
  MIN_ROW_HEIGHT,
} from "metabase/lib/dashboard_grid";
import { connect } from "metabase/lib/redux";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { addUndo } from "metabase/redux/undo";
import { Box, Flex } from "metabase/ui";
import { DefaultMode } from "metabase/visualizations/click-actions/modes/DefaultMode";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import type { ClickActionModeGetter } from "metabase/visualizations/types";
import type {
  BaseDashboardCard,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardTabId,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { SetDashCardAttributesOpts } from "../actions";
import {
  fetchCardData,
  markNewCardSeen,
  navigateToNewCardFromDashboard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  removeCardFromDashboard,
  replaceCard,
  setDashCardAttributes,
  setMultipleDashCardAttributes,
  showClickBehaviorSidebar,
  trashDashboardQuestion,
  undoRemoveCardFromDashboard,
} from "../actions";
import {
  getInitialCardSizes,
  getLayoutForDashCard,
  getLayouts,
  getVisibleCards,
} from "../grid-utils";
import { getDashcardDataMap } from "../selectors";

import { AddSeriesModal } from "./AddSeriesModal/AddSeriesModal";
import { DashCard } from "./DashCard/DashCard";
import DashCardS from "./DashCard/DashCard.module.css";
import { FIXED_WIDTH } from "./Dashboard/DashboardComponents";
import S from "./DashboardGrid.module.css";
import { ReplaceCardModal } from "./ReplaceCardModal";
import { GridLayout } from "./grid/GridLayout";

type GridBreakpoint = "desktop" | "mobile";

type ExplicitSizeProps = {
  width: number;
};

interface DashboardGridInnerState {
  visibleCardIds: Set<number>;
  initialCardSizes: { [key: string]: { w: number; h: number } };
  layouts: {
    desktop: ReactGridLayout.Layout[];
    mobile: ReactGridLayout.Layout[];
  };
  _lastProps?: LastProps;
}

/** Props from the previous render to use for comparison in getDerivedStateFromProps */
type LastProps = {
  dashboard: Dashboard;
  isEditing: boolean;
  selectedTabId: DashboardTabId | null;
};

const mapStateToProps = (state: State) => ({
  dashcardData: getDashcardDataMap(state),
});

const mapDispatchToProps = {
  addUndo,
  removeCardFromDashboard,
  trashDashboardQuestion,
  showClickBehaviorSidebar,
  markNewCardSeen,
  setMultipleDashCardAttributes,
  setDashCardAttributes,
  undoRemoveCardFromDashboard,
  replaceCard,
  onChangeLocation: push,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  fetchCardData,
};
const connector = connect(mapStateToProps, mapDispatchToProps, null, {
  forwardRef: true,
});

type DashboardGridReduxProps = ConnectedProps<typeof connector>;

export type DashboardGridProps = {
  dashboard: Dashboard;
  selectedTabId: DashboardTabId | null;
  slowCards: Record<DashCardId, boolean>;
  isEditing?: boolean;
  isEditingParameter?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isXray?: boolean;
  isFullscreen?: boolean;
  isNightMode?: boolean;
  withCardTitle?: boolean;
  clickBehaviorSidebarDashcard: DashboardCard | null;
  getClickActionMode?: ClickActionModeGetter | undefined;
  // public dashboard passes it explicitly
  width?: number;
  // public or embedded dashboard passes it as noop
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  downloadsEnabled: boolean;
  autoScrollToDashcardId?: DashCardId;
  reportAutoScrolledToDashcard?: () => void;
};

type DashboardGridInnerProps = DashboardGridProps &
  DashboardGridReduxProps &
  ExplicitSizeProps & {
    isEditing: boolean;
    forwardedRef?: ForwardedRef<HTMLDivElement>;
    rowHeight: number;
    isEditingLayout: boolean;
    isDragging: boolean;
    onDrag: (val: boolean) => void;
    onDragStop: () => void;
    getIsLastDashboardQuestionDashcard: (dc: BaseDashboardCard) => boolean;
    addSeriesModalDashCard: BaseDashboardCard | null;
    setAddSeriesModalDashCard: (dc: BaseDashboardCard | null) => void;
    replaceCardModalDashCard: BaseDashboardCard | null;
    setReplaceCardModalDashCard: (dc: BaseDashboardCard | null) => void;
    isAnimationPaused: boolean;
    onDashCardRemove: (dc: DashboardCard) => void;
    dashcardCountByCardId: Record<CardId, number>;
  };

class DashboardGridInner extends Component<
  DashboardGridInnerProps,
  DashboardGridInnerState
> {
  constructor(props: DashboardGridInnerProps) {
    super(props);

    const visibleCardIds = getVisibleCardIds(
      props.dashboard.dashcards,
      props.dashcardData,
    );

    const initialCardSizes = getInitialCardSizes(
      props.dashboard.dashcards,
      this.state?.initialCardSizes,
    );

    this.state = {
      visibleCardIds,
      initialCardSizes,
      layouts: getLayouts(
        props.dashboard.dashcards,
        this.state?.initialCardSizes,
      ),
      _lastProps: {
        dashboard: props.dashboard,
        isEditing: props.isEditing,
        selectedTabId: props.selectedTabId,
      },
    };
  }

  static getDerivedStateFromProps(
    nextProps: DashboardGridInnerProps,
    state: DashboardGridInnerState,
  ): Partial<DashboardGridInnerState> {
    const { dashboard, dashcardData, isEditing, selectedTabId } = nextProps;
    const lastProps = state._lastProps;

    const visibleCardIds = !isEditing
      ? getVisibleCardIds(
          dashboard.dashcards,
          dashcardData,
          state.visibleCardIds,
        )
      : new Set(dashboard.dashcards.map((card) => card.id));

    const visibleCards = getVisibleCards(
      dashboard.dashcards,
      visibleCardIds,
      isEditing,
      selectedTabId,
    );

    const lastVisibleCards = lastProps?.dashboard?.dashcards
      ? getVisibleCards(
          lastProps.dashboard.dashcards,
          state.visibleCardIds,
          lastProps.isEditing,
          lastProps.selectedTabId,
        )
      : [];

    const hasVisibleDashcardsChanged = !_.isEqual(
      visibleCards,
      lastVisibleCards,
    );

    const initialCardSizes =
      !isEditing || hasVisibleDashcardsChanged
        ? getInitialCardSizes(visibleCards, state.initialCardSizes)
        : state.initialCardSizes;

    return {
      visibleCardIds,
      initialCardSizes,
      layouts: getLayouts(visibleCards, state.initialCardSizes),
      _lastProps: {
        dashboard,
        isEditing,
        selectedTabId,
      },
    };
  }

  onLayoutChange = ({
    layout,
    breakpoint,
  }: {
    layout: ReactGridLayout.Layout[];
    breakpoint: GridBreakpoint;
  }) => {
    const { setMultipleDashCardAttributes, isEditing } = this.props;

    // We allow moving and resizing cards only on the desktop
    // Ensures onLayoutChange triggered by window resize,
    // won't break the main layout
    if (!isEditing || breakpoint !== "desktop") {
      return;
    }

    const changes: SetDashCardAttributesOpts[] = [];

    layout.forEach((layoutItem) => {
      const dashboardCard = this.getVisibleCards().find(
        (card) => String(card.id) === layoutItem.i,
      );
      if (dashboardCard) {
        const keys = ["h", "w", "x", "y"];
        const changed = !_.isEqual(
          _.pick(layoutItem, keys),
          _.pick(
            getLayoutForDashCard(dashboardCard, this.state?.initialCardSizes),
            keys,
          ),
        );

        if (changed) {
          changes.push({
            id: dashboardCard.id,
            attributes: {
              col: layoutItem.x,
              row: layoutItem.y,
              size_x: layoutItem.w,
              size_y: layoutItem.h,
            },
          });
        }
      }
    });

    if (changes.length > 0) {
      setMultipleDashCardAttributes({ dashcards: changes });
    }
  };

  getVisibleCards = (
    cards = this.props.dashboard.dashcards,
    visibleCardIds = this.state.visibleCardIds,
    isEditing = this.props.isEditing,
    selectedTabId = this.props.selectedTabId,
  ) => {
    return getVisibleCards(
      cards,
      visibleCardIds,
      isEditing,
      selectedTabId,
    ) as DashboardCard[];
  };

  render() {
    const {
      replaceCardModalDashCard,
      setReplaceCardModalDashCard,
      rowHeight,
      dashboard,
      width,
      addSeriesModalDashCard,
      setAddSeriesModalDashCard,
      forwardedRef,
    } = this.props;
    const { layouts } = this.state;
    const isAddSeriesOpen =
      !!addSeriesModalDashCard && isQuestionDashCard(addSeriesModalDashCard);
    return (
      <Flex
        align="center"
        justify="center"
        className={cx(S.DashboardGridContainer, {
          [S.isFixedWidth]: dashboard?.width === "fixed",
        })}
        ref={forwardedRef}
        data-testid="dashboard-grid"
        style={{
          "--dashboard-fixed-width": FIXED_WIDTH,
        }}
      >
        {width > 0 ? (
          <GridLayout<DashboardCard>
            className={cx({
              [DashboardS.DashEditing]: this.props.isEditingLayout,
              [DashboardS.DashDragging]: this.props.isDragging,
              [DashCardS.DashboardCardRootDragging]: this.props.isDragging,
            })}
            layouts={layouts}
            breakpoints={GRID_BREAKPOINTS}
            cols={GRID_COLUMNS}
            width={width}
            margin={{ desktop: [6, 6], mobile: [6, 10] }}
            containerPadding={[0, 0]}
            rowHeight={rowHeight}
            onLayoutChange={this.onLayoutChange}
            onDrag={(val) => this.props.onDrag(!!val)}
            onDragStop={this.props.onDragStop}
            isEditing={this.props.isEditingLayout}
            compactType="vertical"
            items={this.getVisibleCards()}
            itemRenderer={({
              item: dc,
              breakpoint,
              gridItemWidth,
              totalNumGridCols,
            }) => {
              const {
                isEditing,
                autoScrollToDashcardId,
                reportAutoScrolledToDashcard,
                setReplaceCardModalDashCard,
                setAddSeriesModalDashCard,
              } = this.props;
              const shouldAutoScrollTo = autoScrollToDashcardId === dc.id;
              const shouldChangeResizeHandle = isEditingTextOrHeadingCard(
                dc.card.display,
                isEditing,
              );
              return (
                <Box
                  key={String(dc.id)}
                  data-testid="dashcard-container"
                  className={cx(
                    DashboardS.DashCard,
                    EmbedFrameS.DashCard,
                    LegendS.DashCard,
                    S.DashboardCardContainer,
                    {
                      [DashboardS.BrandColorResizeHandle]:
                        shouldChangeResizeHandle,
                      [S.isAnimationDisabled]: this.props.isAnimationPaused,
                    },
                  )}
                >
                  <DashCard
                    className={S.Card}
                    dashcard={dc}
                    slowCards={this.props.slowCards}
                    gridItemWidth={gridItemWidth}
                    totalNumGridCols={totalNumGridCols}
                    markNewCardSeen={this.props.markNewCardSeen}
                    isEditing={this.props.isEditing}
                    isEditingParameter={this.props.isEditingParameter}
                    isFullscreen={this.props.isFullscreen}
                    isNightMode={this.props.isNightMode}
                    isMobile={breakpoint === "mobile"}
                    isPublicOrEmbedded={this.props.isPublicOrEmbedded}
                    isXray={this.props.isXray}
                    withTitle={this.props.withCardTitle}
                    onRemove={this.props.onDashCardRemove}
                    onAddSeries={(dc: BaseDashboardCard) => {
                      setAddSeriesModalDashCard(dc);
                    }}
                    onReplaceCard={setReplaceCardModalDashCard}
                    onUpdateVisualizationSettings={
                      this.props.onUpdateDashCardVisualizationSettings
                    }
                    onReplaceAllDashCardVisualizationSettings={
                      this.props.onReplaceAllDashCardVisualizationSettings
                    }
                    getClickActionMode={this.props.getClickActionMode}
                    navigateToNewCardFromDashboard={
                      this.props.navigateToNewCardFromDashboard
                    }
                    onChangeLocation={this.props.onChangeLocation}
                    dashboard={this.props.dashboard}
                    showClickBehaviorSidebar={
                      this.props.showClickBehaviorSidebar
                    }
                    clickBehaviorSidebarDashcard={
                      this.props.clickBehaviorSidebarDashcard
                    }
                    downloadsEnabled={this.props.downloadsEnabled}
                    autoScroll={shouldAutoScrollTo}
                    isTrashedOnRemove={this.props.getIsLastDashboardQuestionDashcard(
                      dc,
                    )}
                    reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
                  />
                </Box>
              );
            }}
          />
        ) : (
          <div />
        )}
        {isAddSeriesOpen && (
          <Modal
            className={cx(
              ModalS.Modal,
              DashboardS.Modal,
              DashboardS.AddSeriesModal,
            )}
            data-testid="add-series-modal"
            isOpen={isAddSeriesOpen}
          >
            <AddSeriesModal
              dashcard={addSeriesModalDashCard}
              dashcardData={this.props.dashcardData}
              fetchCardData={this.props.fetchCardData}
              setDashCardAttributes={this.props.setDashCardAttributes}
              onClose={() => setAddSeriesModalDashCard(null)}
            />
          </Modal>
        )}
        <ReplaceCardModal
          isOpen={
            !!replaceCardModalDashCard &&
            isQuestionDashCard(replaceCardModalDashCard)
          }
          dashcard={replaceCardModalDashCard}
          dashboard={dashboard}
          onClose={() => setReplaceCardModalDashCard(null)}
          onReplace={this.props.replaceCard}
          onUndo={this.props.addUndo}
          setDashCardAttributes={this.props.setDashCardAttributes}
        />
      </Flex>
    );
  }
}

function isEditingTextOrHeadingCard(display: string, isEditing: boolean) {
  const isTextOrHeadingCard = display === "heading" || display === "text";

  return isEditing && isTextOrHeadingCard;
}

const DashboardGrid = forwardRef<
  HTMLDivElement,
  DashboardGridProps & DashboardGridReduxProps
>(function _DashboardGrid(
  {
    isEditing = false,
    isEditingParameter = false,
    withCardTitle = true,
    isNightMode = false,
    isFullscreen = false,
    width = 0,
    clickBehaviorSidebarDashcard,
    dashboard,
    removeCardFromDashboard,
    addUndo,
    undoRemoveCardFromDashboard,
    ...restProps
  },
  ref,
) {
  const getDashcardCountByCardId = (cards: BaseDashboardCard[]) =>
    _.countBy(cards, "card_id");

  const contentViewportElement = useContext(ContentViewportContext);
  const [isDragging, setIsDragging] = useState(false);
  const [addSeriesModalDashCard, setAddSeriesModalDashCard] =
    useState<BaseDashboardCard | null>(null);
  const [replaceCardModalDashCard, setReplaceCardModalDashCard] =
    useState<BaseDashboardCard | null>(null);
  const [isAnimationPaused, setIsAnimationPaused] = useState(true);

  const _pauseAnimationTimer = useRef<NodeJS.Timeout | null>(null);

  useMount(() => {
    // In order to skip the initial cards animation we must let the grid layout calculate
    // the initial card positions. The timer is necessary to enable animation only
    // after the grid layout has been calculated and applied to the DOM.
    _pauseAnimationTimer.current = setTimeout(() => {
      setIsAnimationPaused(false);
    }, 0);
  });

  useUnmount(() => {
    if (_pauseAnimationTimer.current !== null) {
      clearTimeout(_pauseAnimationTimer.current);
    }
  });

  const getIsLastDashboardQuestionDashcard = (
    dc: BaseDashboardCard,
  ): boolean => {
    return Boolean(
      dc.card.dashboard_id !== null &&
        dc.card_id &&
        dashcardCountByCardId[dc.card_id] <= 1,
    );
  };

  const dashcardCountByCardId = useMemo(
    () => getDashcardCountByCardId(dashboard.dashcards),
    [dashboard.dashcards],
  );

  const isEditingLayout = useMemo(() => {
    return Boolean(
      isEditing && !isEditingParameter && clickBehaviorSidebarDashcard == null,
    );
  }, [clickBehaviorSidebarDashcard, isEditing, isEditingParameter]);

  const rowHeight = useMemo(() => {
    const hasScroll =
      contentViewportElement &&
      contentViewportElement?.clientHeight <
        contentViewportElement?.scrollHeight;

    const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
    const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

    // prevent infinite re-rendering when the scroll bar appears/disappears
    // https://github.com/metabase/metabase/issues/17229
    return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
  }, [contentViewportElement, width]);

  const onDashCardRemove = (dc: DashboardCard) => {
    removeCardFromDashboard({
      dashcardId: dc.id,
      cardId: dc.card_id,
    });

    addUndo({
      message: getIsLastDashboardQuestionDashcard(dc)
        ? t`Trashed and removed card`
        : t`Removed card`,
      undo: true,
      action: () => undoRemoveCardFromDashboard({ dashcardId: dc.id }),
    });
  };

  return (
    <DashboardGridInner
      width={width}
      isEditing={isEditing}
      isEditingParameter={isEditingParameter}
      withCardTitle={withCardTitle}
      isNightMode={isNightMode}
      isFullscreen={isFullscreen}
      clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
      isEditingLayout={isEditingLayout}
      isDragging={isDragging}
      rowHeight={rowHeight}
      onDrag={(val: boolean) => !val && setIsDragging(true)}
      onDragStop={() => setIsDragging(false)}
      replaceCardModalDashCard={replaceCardModalDashCard}
      setReplaceCardModalDashCard={setReplaceCardModalDashCard}
      getIsLastDashboardQuestionDashcard={getIsLastDashboardQuestionDashcard}
      addSeriesModalDashCard={addSeriesModalDashCard}
      setAddSeriesModalDashCard={setAddSeriesModalDashCard}
      isAnimationPaused={isAnimationPaused}
      onDashCardRemove={onDashCardRemove}
      dashboard={dashboard}
      removeCardFromDashboard={removeCardFromDashboard}
      addUndo={addUndo}
      undoRemoveCardFromDashboard={undoRemoveCardFromDashboard}
      dashcardCountByCardId={dashcardCountByCardId}
      {...restProps}
      forwardedRef={ref}
    />
  );
});

export const DashboardGridConnected = _.compose(
  ExplicitSize(),
  connector,
)(DashboardGrid) as ComponentType<DashboardGridProps>;
