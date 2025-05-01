/* eslint-disable react/prop-types */
import cx from "classnames";

import DashboardS from "metabase/css/dashboard.module.css";
import { GRID_BREAKPOINTS, GRID_COLUMNS } from "metabase/lib/dashboard_grid";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Box } from "metabase/ui";
import LegendS from "metabase/visualizations/components/Legend.module.css";
import type { DashboardCard } from "metabase-types/api";

import { DashCard, type DashCardProps } from "../DashCard/DashCard";
import DashCardS from "../DashCard/DashCard.module.css";
import { GridLayout, type GridLayoutProps } from "../grid/GridLayout";

import S from "./DashboardGrid.module.css";

export type DashboardGridRenderProps = Pick<
  GridLayoutProps<DashboardCard>,
  "layouts" | "onLayoutChange" | "onDrag" | "onDragStop"
> &
  Pick<
    DashCardProps,
    | "markNewCardSeen"
    | "isEditing"
    | "isEditingParameter"
    | "isFullscreen"
    | "isNightMode"
    | "isPublicOrEmbedded"
    | "isXray"
    | "onReplaceAllDashCardVisualizationSettings"
    | "getClickActionMode"
    | "navigateToNewCardFromDashboard"
    | "onChangeLocation"
    | "dashboard"
    | "showClickBehaviorSidebar"
    | "clickBehaviorSidebarDashcard"
    | "downloadsEnabled"
  > & {
    width: number;
    rowHeight: number;
    isEditingLayout: boolean;
    isDragging: boolean;
    visibleCards: DashboardCard[];
    autoScrollToDashcardId?: string | number;
    reportAutoScrolledToDashcard: () => void;
    slowCards: Record<string | number, boolean>;
    withCardTitle: boolean;
    onDashCardRemove: DashCardProps["onRemove"];
    onDashCardAddSeries: DashCardProps["onAddSeries"];
    onReplaceCard: DashCardProps["onReplaceCard"];
    onUpdateDashCardVisualizationSettings: DashCardProps["onUpdateVisualizationSettings"];
    getIsLastDashboardQuestionDashcard: (dashcard: DashboardCard) => boolean;
    isAnimationPaused: boolean;
  };

export const DashboardGridRender = ({
  width,
  layouts,
  rowHeight,
  isEditingLayout,
  isDragging,
  onLayoutChange,
  onDrag,
  onDragStop,
  visibleCards,
  isEditing = false,
  autoScrollToDashcardId,
  reportAutoScrolledToDashcard,
  downloadsEnabled,
  isAnimationPaused,
  slowCards,
  markNewCardSeen,
  isEditingParameter,
  isFullscreen,
  isNightMode,
  isPublicOrEmbedded,
  isXray,
  withCardTitle,
  onUpdateDashCardVisualizationSettings,
  onReplaceAllDashCardVisualizationSettings,
  getClickActionMode,
  navigateToNewCardFromDashboard,
  onChangeLocation,
  dashboard,
  showClickBehaviorSidebar,
  clickBehaviorSidebarDashcard,
  onDashCardRemove,
  onDashCardAddSeries,
  onReplaceCard,
  getIsLastDashboardQuestionDashcard,
}: DashboardGridRenderProps) => (
  <GridLayout<DashboardCard>
    className={cx({
      [DashboardS.DashEditing]: isEditingLayout,
      [DashboardS.DashDragging]: isDragging,
      // we use this class to hide a dashcard actions
      // panel during dragging
      [DashCardS.DashboardCardRootDragging]: isDragging,
    })}
    layouts={layouts}
    breakpoints={GRID_BREAKPOINTS}
    cols={GRID_COLUMNS}
    width={width}
    margin={{ desktop: [6, 6], mobile: [6, 10] }}
    containerPadding={[0, 0]}
    rowHeight={rowHeight}
    onLayoutChange={onLayoutChange}
    onDrag={onDrag}
    onDragStop={onDragStop}
    isEditing={isEditingLayout}
    compactType="vertical"
    items={visibleCards}
    itemRenderer={({
      item,
      gridItemWidth,
      breakpoint,
      totalNumGridCols,
    }: {
      item: DashboardCard;
      gridItemWidth: number;
      breakpoint: "desktop" | "mobile";
      totalNumGridCols: number;
    }) => {
      const shouldAutoScrollTo = autoScrollToDashcardId === item.id;

      const shouldChangeResizeHandle = isEditingTextOrHeadingCard(
        item.card.display,
        isEditing,
      );
      return (
        // Note:  the GridLayout needs the Box to have a component that it can attach a ref to.
        // It seems like the ref attachment is implicit so whatever component goes here must be able to accept a ref
        // If you know something I don't feel free to write "oisin was wrong" below, with the explanation
        <Box
          key={String(item.id)}
          data-testid="dashcard-container"
          className={cx(
            DashboardS.DashCard,
            EmbedFrameS.DashCard,
            LegendS.DashCard,
            S.DashboardCardContainer,
            {
              [DashboardS.BrandColorResizeHandle]: shouldChangeResizeHandle,
              [S.isAnimationDisabled]: isAnimationPaused,
            },
          )}
        >
          <DashCard
            className={S.Card}
            dashcard={item}
            slowCards={slowCards}
            gridItemWidth={gridItemWidth}
            totalNumGridCols={totalNumGridCols}
            markNewCardSeen={markNewCardSeen}
            isEditing={isEditing}
            isEditingParameter={isEditingParameter}
            isFullscreen={isFullscreen}
            isNightMode={isNightMode}
            isMobile={breakpoint === "mobile"}
            isPublicOrEmbedded={isPublicOrEmbedded}
            isXray={isXray}
            withTitle={withCardTitle}
            onRemove={onDashCardRemove}
            onAddSeries={onDashCardAddSeries}
            onReplaceCard={onReplaceCard}
            onUpdateVisualizationSettings={
              onUpdateDashCardVisualizationSettings
            }
            onReplaceAllDashCardVisualizationSettings={
              onReplaceAllDashCardVisualizationSettings
            }
            getClickActionMode={getClickActionMode}
            navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
            onChangeLocation={onChangeLocation}
            dashboard={dashboard}
            showClickBehaviorSidebar={showClickBehaviorSidebar}
            clickBehaviorSidebarDashcard={clickBehaviorSidebarDashcard}
            downloadsEnabled={downloadsEnabled}
            autoScroll={shouldAutoScrollTo}
            isTrashedOnRemove={getIsLastDashboardQuestionDashcard(item)}
            reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
          />
        </Box>
      );
    }}
  />
);
export function isEditingTextOrHeadingCard(
  display: string,
  isEditing: boolean,
) {
  const isTextOrHeadingCard = display === "heading" || display === "text";

  return isEditing && isTextOrHeadingCard;
}
