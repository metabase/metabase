import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getMetricSeriesWithDefaultDisplay } from "metabase/common/utils/card";
import CS from "metabase/css/core/index.css";
import { setParameterValuesFromQueryParams } from "metabase/dashboard/actions/parameters";
import { getDashboardClickActionMode } from "metabase/dashboard/click-behavior/mode";
import { useDashboardContext } from "metabase/dashboard/context";
import { useClickBehaviorData } from "metabase/dashboard/hooks";
import { useResponsiveParameterList } from "metabase/dashboard/hooks/use-responsive-parameter-list";
import {
  getDashCardInlineValuePopulatedParameters,
  getDashcardData,
} from "metabase/dashboard/selectors";
import { useDashCardTimelineEvents } from "metabase/dashboard/timeline-events";
import {
  getVirtualCardType,
  isDashcardAccessRestricted,
} from "metabase/dashboard/utils";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import type { Path } from "metabase/router";
import { useNavigate } from "metabase/router";
import { getSetting } from "metabase/settings";
import { Flex, Group, type IconProps, Menu, Title } from "metabase/ui";
import { parseSearchQuery } from "metabase/utils/browser";
import { isVirtualDashCard } from "metabase/utils/dashboard";
import { measureTextWidth } from "metabase/utils/measure-text";
import Visualization from "metabase/visualizations/components/Visualization";
import { DashCardLoadingView } from "metabase/visualizations/components/Visualization/LoadingView/DashCardLoadingView";
import type { LoadingViewProps } from "metabase/visualizations/components/Visualization/LoadingView/LoadingView";
import {
  LEGEND_LABEL_FONT_SIZE,
  LEGEND_LABEL_FONT_WEIGHT,
} from "metabase/visualizations/components/legend/LegendCaption";
import type {
  CardSlownessStatus,
  ClickObject,
} from "metabase/visualizations/types";
import { DEFAULT_VISUALIZER_DISPLAY } from "metabase/visualizer/constants";
import {
  createDataSource,
  formatVisualizerClickObject,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils";
import { getVisualizationColumns } from "metabase/visualizer/utils/get-visualization-columns";
import {
  extendCardWithDashcardSettings,
  getComputedSettingsForSeries,
  getVisualizationRaw,
  isCartesianChart,
} from "metabase/viz-core";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/v1/queries/StructuredQuery";
import type {
  Card,
  CardId,
  DashCardId,
  DashCardSeries,
  DashCardSeriesItem,
  DashboardCard,
  Dataset,
  DatasetData,
  IconName,
  Series,
  SeriesCard,
  VirtualCardDisplay,
  VisualizationSettings,
  VisualizerDataSourceId,
  VisualizerSeries,
  VisualizerSeriesItem,
} from "metabase-types/api";
import {
  isDashCardDataSeries,
  isVisualizerDashboardCard,
  isVisualizerDataSeries,
} from "metabase-types/guards/dashboard";

import { CollapsibleDashboardParameterList } from "../CollapsibleDashboardParameterList";

import { ClickBehaviorSidebarOverlay } from "./ClickBehaviorSidebarOverlay/ClickBehaviorSidebarOverlay";
import { DashCardMenu } from "./DashCardMenu/DashCardMenu";
import { DashCardParameterMapper } from "./DashCardParameterMapper/DashCardParameterMapper";
import S from "./DashCardVisualization.module.css";
import { getDashcardTokenId, getDashcardUuid } from "./dashcard-ids";
import type { DashCardOnChangeCardAndRunHandler } from "./types";
import {
  getCardsFromSeries,
  getMissingColumnsFromVisualizationSettings,
  shouldShowParameterMapper,
} from "./utils";

/**
 * This populates the `data` field of each series with an empty
 * object if it doesn't already have one. This is useful to compute
 * the visualization settings correctly before data is loaded.
 *
 * @param series the series to sanitize
 */
function sanitizeSeriesData(
  series: (DashCardSeriesItem | VisualizerSeriesItem)[],
): Series {
  // TODO: all the settings code assumes we have a Series
  // but VirtualCards don't have a dataset_query
  return series.map((s) => {
    if ("data" in s && s.data != null) {
      // If the series already has data, we're good
      return s;
    }

    return {
      ...s,
      data: { cols: [], rows: [] },
    };
  }) as Series;
}
interface DashCardVisualizationProps {
  dashcard: DashboardCard;
  series: DashCardSeries;
  question: Question | null;
  metadata: Metadata;
  getHref?: () => string | undefined;

  gridSize: {
    width: number;
    height: number;
  };
  gridItemWidth: number;
  totalNumGridCols: number;

  expectedDuration: number;
  isSlow: CardSlownessStatus;

  isAction: boolean;
  isPreviewing: boolean;
  isClickBehaviorSidebarOpen: boolean;
  isEditingDashCardClickBehavior: boolean;
  isEditingDashboardLayout: boolean;
  isMobile?: boolean;

  error?: { message?: string; icon?: IconName };
  headerIcon?: IconProps;

  onUpdateVisualizationSettings: (
    id: DashCardId,
    settings: VisualizationSettings,
  ) => void;
  onChangeCardAndRun: DashCardOnChangeCardAndRunHandler | null;
  showClickBehaviorSidebar: (dashCardId: DashCardId | null) => void;
  onTogglePreviewing: () => void;

  onEditVisualization?: () => void;
}

// This is done to add the `getExtraDataForClick` prop.
// We need that to pass relevant data along with the clicked object.

export function DashCardVisualization({
  dashcard,
  series: rawSeries,
  question,
  metadata,
  getHref,
  gridSize,
  gridItemWidth,
  totalNumGridCols,
  expectedDuration,
  error,
  headerIcon,
  isAction,
  isSlow,
  isPreviewing,
  isEditingDashboardLayout,
  isClickBehaviorSidebarOpen,
  isEditingDashCardClickBehavior,
  isMobile = false,
  onChangeCardAndRun,
  onTogglePreviewing,
  showClickBehaviorSidebar,
  onUpdateVisualizationSettings,
  onEditVisualization,
}: DashCardVisualizationProps) {
  const {
    cardTitled,
    dashboard,
    dashcardMenu,
    getClickActionMode,
    isEditing = false,
    isFullscreen = false,
    isEditingParameter,
    onChangeLocation,
    enableEntityNavigation,
  } = useDashboardContext();

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onSameOriginNavigation = useCallback(
    (location: Partial<Path>) => {
      navigate(location);
      dispatch(
        setParameterValuesFromQueryParams(
          parseSearchQuery(location.search ?? ""),
        ),
      );
    },
    [dispatch, navigate],
  );

  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const {
    isEnabled: isTimelineEventsEnabled,
    timelineEvents,
    selectedTimelineEventIds,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
  } = useDashCardTimelineEvents(dashcard);

  const inlineParameters = useSelector((state) =>
    getDashCardInlineValuePopulatedParameters(state, dashcard.id),
  );

  const visualizerErrMsg = useMemo(() => {
    if (
      !dashcard ||
      !rawSeries ||
      rawSeries.length === 0 ||
      !isVisualizerDashboardCard(dashcard) ||
      !isDashCardDataSeries(rawSeries)
    ) {
      return;
    }
    // Skip when access is denied; the permission message would otherwise be
    // masked by "Some columns are missing".
    if (isDashcardAccessRestricted(rawSeries)) {
      return;
    }

    const missingCols = getMissingColumnsFromVisualizationSettings({
      visualizerEntity: dashcard.visualization_settings.visualization,
      rawSeries,
    });

    if (missingCols.flat().length > 0) {
      return t`Some columns are missing, this card might not render correctly.`;
    }
  }, [dashcard, rawSeries]);

  const untranslatedSeries: DashCardSeries | VisualizerSeries = useMemo(() => {
    if (!dashcard || !rawSeries || rawSeries.length === 0) {
      return rawSeries;
    }

    if (!isVisualizerDashboardCard(dashcard)) {
      return getMetricSeriesWithDefaultDisplay(rawSeries, metadata);
    }

    const visualizerEntity = dashcard.visualization_settings.visualization;
    const { display, columnValuesMapping, settings } = visualizerEntity;

    const cards = [dashcard.card];
    if (Array.isArray(dashcard.series)) {
      cards.push(...dashcard.series);
    }

    const dataSources = cards.map((card) =>
      createDataSource("card", card.id, card.name),
    );

    const dataSourceDatasets: Record<
      VisualizerDataSourceId,
      Dataset | null | undefined
    > = Object.fromEntries(
      Object.entries(datasets ?? {}).map(([cardId, dataset]) => [
        `card:${cardId}`,
        dataset,
      ]),
    );

    const everyDatasetLoaded = dataSources.every((dataSource) => {
      const dataset = dataSourceDatasets[dataSource.id];
      return dataset != null && dataset.error == null;
    });

    const columns = getVisualizationColumns(
      visualizerEntity,
      dataSourceDatasets,
      dataSources,
    );

    const card: SeriesCard = extendCardWithDashcardSettings(
      {
        // Visualizer click handling code expect visualizer cards not to have card.id
        name: dashcard.card.name,
        description: dashcard.card.description,
        display: display ?? DEFAULT_VISUALIZER_DISPLAY,
        visualization_settings: settings,
        dataset_query: STRUCTURED_QUERY_TEMPLATE,
      },
      _.omit(dashcard.visualization_settings, "visualization"),
    );

    if (!everyDatasetLoaded) {
      // No `data` so the parent <Visualization> picks its error or loading view.
      return [{ card, _isVisualizer: true }];
    }

    const series: VisualizerSeries = [
      {
        card,
        // Unjustified type cast. FIXME
        data: mergeVisualizerData({
          columns,
          columnValuesMapping,
          datasets: dataSourceDatasets,
          dataSources,
        }) as DatasetData,
        // Certain visualizations memoize settings computation based on series keys
        // This guarantees a visualization always rerenders on changes
        started_at: new Date().toISOString(),
        columnValuesMapping,
        json_query: rawSeries[0].json_query,
        _isVisualizer: true,
      },
    ];

    if (
      display &&
      isCartesianChart(display) &&
      shouldSplitVisualizerSeries(columnValuesMapping) &&
      isVisualizerDataSeries(series)
    ) {
      const dataSourceNameMap = Object.fromEntries(
        dataSources.map((dataSource) => [dataSource.id, dataSource.name]),
      );
      return splitVisualizerSeries(
        series,
        columnValuesMapping,
        dataSourceNameMap,
      ).map((s) => ({ ...s, _isVisualizer: true })) satisfies VisualizerSeries;
    }

    return series;
  }, [rawSeries, dashcard, datasets, metadata]);

  const series = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries<
    DashCardSeriesItem | VisualizerSeriesItem
  >(untranslatedSeries);

  const handleOnUpdateVisualizationSettings = useCallback(
    (settings: VisualizationSettings) => {
      onUpdateVisualizationSettings(dashcard.id, settings);
    },
    [dashcard.id, onUpdateVisualizationSettings],
  );

  const visualizationOverlay = useMemo(() => {
    if (isClickBehaviorSidebarOpen) {
      const disableClickBehavior =
        getVisualizationRaw(series)?.disableClickBehavior;
      if (isVirtualDashCard(dashcard) || disableClickBehavior) {
        // Unjustified type cast. FIXME
        const virtualDashcardType = getVirtualCardType(
          dashcard,
        ) as VirtualCardDisplay;
        const placeholderText =
          {
            link: t`Link`,
            action: t`Action Button`,
            text: t`Text Card`,
            heading: t`Heading Card`,
            placeholder: t`Placeholder Card`,
            iframe: t`Iframe Card`,
          }[virtualDashcardType] ??
          t`This card does not support click mappings`;

        return (
          <Flex align="center" justify="center" h="100%">
            <Title className={S.VirtualDashCardOverlayText} order={4} p="md">
              {placeholderText}
            </Title>
          </Flex>
        );
      }
      return (
        <ClickBehaviorSidebarOverlay
          dashcard={dashcard}
          dashcardWidth={gridItemWidth}
          showClickBehaviorSidebar={showClickBehaviorSidebar}
          isShowingThisClickBehaviorSidebar={isEditingDashCardClickBehavior}
        />
      );
    }

    if (shouldShowParameterMapper({ dashcard, isEditingParameter })) {
      return (
        <DashCardParameterMapper dashcard={dashcard} isMobile={isMobile} />
      );
    }

    return null;
  }, [
    dashcard,
    gridItemWidth,
    isMobile,
    isEditingParameter,
    isClickBehaviorSidebarOpen,
    isEditingDashCardClickBehavior,
    showClickBehaviorSidebar,
    series,
  ]);

  const token = useMemo(() => getDashcardTokenId(dashcard), [dashcard]);
  const uuid = useMemo(() => getDashcardUuid(dashcard), [dashcard]);

  const findCardById = useCallback(
    (cardId?: CardId | null): Card | undefined => {
      const cards = getCardsFromSeries(
        isVisualizerDashboardCard(dashcard) ? rawSeries : series,
      );
      return cards.find((card) => card.id === cardId) ?? cards[0];
    },
    [rawSeries, dashcard, series],
  );

  const handleChangeCardAndRun = useCallback(
    ({ nextCard, objectId }: { nextCard: SeriesCard; objectId?: number }) => {
      const previousCard = findCardById(nextCard?.id);
      if (previousCard) {
        onChangeCardAndRun?.({
          previousCard,
          nextCard: nextCard,
          objectId,
        });
      }
    },
    [onChangeCardAndRun, findCardById],
  );

  const onOpenQuestion = useCallback(
    (cardId: CardId | null) => {
      const card = findCardById(cardId);
      if (card) {
        handleChangeCardAndRun({
          nextCard: card,
        });
      }
    },
    [findCardById, handleChangeCardAndRun],
  );

  const titleMenuItems = useMemo(
    () =>
      !isEditing &&
      isVisualizerDashboardCard(dashcard) &&
      isDashCardDataSeries(rawSeries)
        ? rawSeries.map((series, index) => (
            <Menu.Item
              key={index}
              onClick={() => {
                onOpenQuestion(series.card.id);
              }}
            >
              {series.card.name}
            </Menu.Item>
          ))
        : undefined,
    [dashcard, rawSeries, onOpenQuestion, isEditing],
  );

  const cardTitle = useMemo(() => {
    const settings = getComputedSettingsForSeries(sanitizeSeriesData(series));
    return settings["card.title"] ?? series?.[0].card.name ?? "";
  }, [series]);

  const fontFamily = useSelector((state) =>
    getSetting(state, "application-font"),
  );

  const { shouldCollapseList, containerRef, parameterListRef } =
    useResponsiveParameterList({
      reservedWidth: measureTextWidth(cardTitle, {
        family: fontFamily,
        size: LEGEND_LABEL_FONT_SIZE,
        weight: LEGEND_LABEL_FONT_WEIGHT,
      }),

      // Bigger buffer space to account for varying chart padding
      bufferSpace: 100,
    });

  const actionButtons = useMemo(() => {
    const cardId = dashcard.card_id ?? dashcard.card?.id;
    const cardResult = cardId ? datasets?.[cardId] : undefined;
    // Unjustified type cast. FIXME
    const result = cardResult ?? (series[0] as unknown as Dataset);
    const isVisualizerCard = isVisualizerDashboardCard(dashcard);
    const openUnderlyingQuestionItems =
      onChangeCardAndRun && !cardTitle ? titleMenuItems : undefined;

    const showMenu =
      question &&
      DashCardMenu.shouldRender({
        question,
        dashboard,
        dashcardMenu,
        result,
        canEdit: !isVisualizerCard,
        openUnderlyingQuestionItems,
        withTimelineEvents: isTimelineEventsEnabled,
      });

    const errorStatus =
      cardResult?.error && typeof cardResult.error === "object"
        ? cardResult.error.status
        : undefined;
    const hasViewAccess = !cardResult || errorStatus !== 403;

    const showInlineParams = inlineParameters.length > 0 && hasViewAccess;

    if (!showMenu && !showInlineParams) {
      return null;
    }

    return (
      <Group>
        {showInlineParams && (
          <CollapsibleDashboardParameterList
            className={S.InlineParametersList}
            triggerClassName={S.InlineParametersMenuTrigger}
            parameters={inlineParameters}
            isCollapsed={shouldCollapseList}
            isSortable={false}
            widgetsPopoverPosition="bottom-end"
            ref={parameterListRef}
          />
        )}
        {showMenu && !isEditing && (
          <DashCardMenu
            question={question}
            result={result}
            dashcard={dashcard}
            canEdit={!isVisualizerCard}
            withTimelineEvents={isTimelineEventsEnabled}
            onEditVisualization={
              isVisualizerCard ? onEditVisualization : undefined
            }
            openUnderlyingQuestionItems={openUnderlyingQuestionItems}
          />
        )}
      </Group>
    );
  }, [
    cardTitle,
    dashboard,
    dashcard,
    dashcardMenu,
    datasets,
    isEditing,
    isTimelineEventsEnabled,
    inlineParameters,
    onChangeCardAndRun,
    onEditVisualization,
    question,
    series,
    titleMenuItems,
    shouldCollapseList,
    parameterListRef,
  ]);

  const { getExtraDataForClick } = useClickBehaviorData({
    dashcardId: dashcard.id,
  });

  // Visualizer cards render remapped columns,
  // so click objects must be mapped back to the columns of the underlying questions before computing actions.
  const transformClickObject = useMemo(() => {
    if (
      !isVisualizerDashboardCard(dashcard) ||
      !isDashCardDataSeries(rawSeries)
    ) {
      return undefined;
    }
    const { columnValuesMapping } =
      dashcard.visualization_settings.visualization;
    return (clicked: ClickObject) =>
      formatVisualizerClickObject(clicked, rawSeries, columnValuesMapping);
  }, [dashcard, rawSeries]);

  const renderLoadingView = (loadingViewProps: LoadingViewProps) => (
    <DashCardLoadingView {...loadingViewProps} display={question?.display()} />
  );

  return (
    <div
      className={cx(S.VisualizationContainer, CS.flexFull, CS.fullHeight, {
        [CS.pointerEventsNone]: isEditingDashboardLayout,
      })}
      ref={containerRef}
    >
      <EmbeddingEntityContextProvider uuid={uuid ?? null} token={token ?? null}>
        <Visualization
          className={cx(S.Visualization, CS.flexFull, {
            [CS.overflowAuto]: visualizationOverlay,
            [CS.overflowHidden]: !visualizationOverlay,
          })}
          dashboard={dashboard ?? undefined}
          dashcard={dashcard}
          rawSeries={series}
          visualizerRawSeries={
            isVisualizerDashboardCard(dashcard) &&
            isDashCardDataSeries(rawSeries)
              ? rawSeries
              : undefined
          }
          metadata={metadata}
          mode={getClickActionMode ?? getDashboardClickActionMode}
          getHref={getHref}
          gridSize={gridSize}
          totalNumGridCols={totalNumGridCols}
          headerIcon={headerIcon}
          expectedDuration={expectedDuration}
          error={error?.message}
          errorIcon={error?.icon}
          showTitle={cardTitled}
          canToggleSeriesVisibility={!isEditing}
          isAction={isAction}
          isDashboard
          isSlow={isSlow}
          isFullscreen={isFullscreen}
          isEditing={isEditing}
          isPreviewing={isPreviewing}
          isEditingParameter={isEditingParameter}
          isMobile={isMobile}
          actionButtons={actionButtons}
          replacementContent={visualizationOverlay}
          getExtraDataForClick={getExtraDataForClick}
          transformClickObject={transformClickObject}
          onUpdateVisualizationSettings={handleOnUpdateVisualizationSettings}
          onTogglePreviewing={onTogglePreviewing}
          onChangeCardAndRun={
            onChangeCardAndRun ? handleChangeCardAndRun : null
          }
          onChangeLocation={onChangeLocation}
          renderLoadingView={renderLoadingView}
          titleMenuItems={titleMenuItems}
          errorMessageOverride={visualizerErrMsg}
          timelineEvents={timelineEvents}
          selectedTimelineEventIds={selectedTimelineEventIds}
          onOpenTimelines={onOpenTimelines}
          onSelectTimelineEvents={onSelectTimelineEvents}
          onDeselectTimelineEvents={onDeselectTimelineEvents}
          enableEntityNavigation={enableEntityNavigation}
          onSameOriginNavigation={onSameOriginNavigation}
          autoAdjustSettings
        />
      </EmbeddingEntityContextProvider>
    </div>
  );
}
