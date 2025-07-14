import cx from "classnames";
import { useCallback, useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";
import { useClickBehaviorData } from "metabase/dashboard/hooks";
import { useResponsiveParameterList } from "metabase/dashboard/hooks/use-responsive-parameter-list";
import {
  getDashCardInlineValuePopulatedParameters,
  getDashcardData,
} from "metabase/dashboard/selectors";
import {
  getVirtualCardType,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { duration } from "metabase/lib/formatting";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { getSetting } from "metabase/selectors/settings";
import {
  Box,
  Button,
  Flex,
  Group,
  HoverCard,
  Icon,
  type IconName,
  type IconProps,
  Menu,
  Text,
  Title,
  Transition,
} from "metabase/ui";
import { getVisualizationRaw, isCartesianChart } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { LoadingViewProps } from "metabase/visualizations/components/Visualization/LoadingView/LoadingView";
import {
  LEGEND_LABEL_FONT_SIZE,
  LEGEND_LABEL_FONT_WEIGHT,
} from "metabase/visualizations/components/legend/LegendCaption";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  createDataSource,
  isVisualizerDashboardCard,
  mergeVisualizerData,
  shouldSplitVisualizerSeries,
  splitVisualizerSeries,
} from "metabase/visualizer/utils";
import { getVisualizationColumns } from "metabase/visualizer/utils/get-visualization-columns";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Card,
  CardDisplayType,
  CardId,
  DashCardId,
  DashboardCard,
  Dataset,
  DatasetData,
  RawSeries,
  Series,
  VirtualCardDisplay,
  VisualizationSettings,
  VisualizerDataSourceId,
} from "metabase-types/api";

import { CollapsibleDashboardParameterList } from "../CollapsibleDashboardParameterList";

import { ClickBehaviorSidebarOverlay } from "./ClickBehaviorSidebarOverlay/ClickBehaviorSidebarOverlay";
import { DashCardMenu } from "./DashCardMenu/DashCardMenu";
import { DashCardParameterMapper } from "./DashCardParameterMapper/DashCardParameterMapper";
import S from "./DashCardVisualization.module.css";
import { getDashcardTokenId, getDashcardUuid } from "./dashcard-ids";
import type {
  CardSlownessStatus,
  DashCardOnChangeCardAndRunHandler,
} from "./types";
import {
  getMissingColumnsFromVisualizationSettings,
  shouldShowParameterMapper,
} from "./utils";

const DashCardLoadingView = ({
  isSlow,
  expectedDuration,
  display,
}: LoadingViewProps & { display?: CardDisplayType }) => {
  return (
    <div
      data-testid="loading-indicator"
      className={cx(CS.px2, CS.pb2, CS.fullHeight)}
    >
      <ChartSkeleton display={display} />
      <Transition
        mounted={!!isSlow}
        transition={{
          in: { opacity: 1, transform: "scale(1)" },
          out: { opacity: 0, transform: "scale(0.8)" },
          transitionProperty: "transform, opacity",
        }}
        duration={80}
      >
        {(styles) => (
          <Box style={styles} className={CS.absolute} left={12} bottom={12}>
            <HoverCard width={288} offset={4} position="bottom-start">
              <HoverCard.Target>
                <Button
                  w={24}
                  h={24}
                  p={0}
                  classNames={{ root: S.invertInNightMode, label: cx(CS.flex) }}
                >
                  <Icon name="snail" size={12} d="flex" />
                </Button>
              </HoverCard.Target>
              <HoverCard.Dropdown ml={-8} className={EmbedFrameS.dropdown}>
                <div className={cx(CS.p2, CS.textCentered)}>
                  <Text fw="bold">{t`Waiting for your data`}</Text>
                  <Text lh="1.5">
                    {isSlow === "usually-slow"
                      ? jt`This usually takes an average of ${(
                          <span className={CS.textNoWrap}>
                            {duration(expectedDuration ?? 0)}
                          </span>
                        )}, but is currently taking longer.`
                      : t`This usually loads immediately, but is currently taking longer.`}
                  </Text>
                </div>
              </HoverCard.Dropdown>
            </HoverCard>
          </Box>
        )}
      </Transition>
    </div>
  );
};

interface DashCardVisualizationProps {
  dashcard: DashboardCard;
  series: Series;
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
  series: untranslatedRawSeries,
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
    editingParameter,
    getClickActionMode,
    isEditing = false,
    shouldRenderAsNightMode,
    isFullscreen = false,
    isEditingParameter,
    onChangeLocation,
  } = useDashboardContext();

  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const inlineParameters = useSelector((state) =>
    getDashCardInlineValuePopulatedParameters(state, dashcard.id),
  );

  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  const visualizerErrMsg = useMemo(() => {
    if (
      !dashcard ||
      !rawSeries ||
      rawSeries.length === 0 ||
      !isVisualizerDashboardCard(dashcard)
    ) {
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

  const series = useMemo(() => {
    if (
      !dashcard ||
      !rawSeries ||
      rawSeries.length === 0 ||
      !isVisualizerDashboardCard(dashcard)
    ) {
      return rawSeries;
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

    const didEveryDatasetLoad = dataSources.every(
      (dataSource) => dataSourceDatasets[dataSource.id] != null,
    );

    const columns = getVisualizationColumns(
      visualizerEntity,
      dataSourceDatasets,
      dataSources,
    );
    const card = extendCardWithDashcardSettings(
      {
        display,
        name: settings["card.title"],
        visualization_settings: settings,
      } as Card,
      _.omit(dashcard.visualization_settings, "visualization"),
    ) as Card;

    if (!didEveryDatasetLoad) {
      return [{ card }];
    }
    const series: RawSeries = [
      {
        card: extendCardWithDashcardSettings(
          {
            display,
            name: settings["card.title"],
            visualization_settings: settings,
          } as Card,
          _.omit(dashcard.visualization_settings, "visualization"),
        ) as Card,

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
      },
    ];

    if (
      display &&
      isCartesianChart(display) &&
      shouldSplitVisualizerSeries(columnValuesMapping)
    ) {
      const dataSourceNameMap = Object.fromEntries(
        dataSources.map((dataSource) => [dataSource.id, dataSource.name]),
      );
      return splitVisualizerSeries(
        series,
        columnValuesMapping,
        dataSourceNameMap,
      );
    }

    return series;
  }, [rawSeries, dashcard, datasets]);

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
    (cardId?: CardId | null) => {
      const lookupSeries = isVisualizerDashboardCard(dashcard)
        ? rawSeries
        : series;
      return (
        lookupSeries.find((series) => series.card.id === cardId)?.card ??
        lookupSeries[0].card
      );
    },
    [rawSeries, dashcard, series],
  );

  const onOpenQuestion = useCallback(
    (cardId: CardId | null) => {
      const card = findCardById(cardId);
      onChangeCardAndRun?.({
        previousCard: findCardById(card?.id),
        nextCard: card,
      });
    },
    [findCardById, onChangeCardAndRun],
  );

  const titleMenuItems = useMemo(
    () =>
      !isEditing && isVisualizerDashboardCard(dashcard) && rawSeries
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
    const settings = getComputedSettingsForSeries(series);
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
    const result = series[0] as unknown as Dataset;

    if (
      !question ||
      !DashCardMenu.shouldRender({
        question,
        dashboard,
        dashcardMenu,
        result,
      })
    ) {
      return null;
    }

    const effectiveParameters = editingParameter
      ? inlineParameters.filter((param) => param.id === editingParameter.id)
      : inlineParameters;

    return (
      <Group>
        {effectiveParameters.length > 0 && (
          <CollapsibleDashboardParameterList
            className={S.InlineParametersList}
            triggerClassName={S.InlineParametersMenuTrigger}
            parameters={effectiveParameters}
            isCollapsed={shouldCollapseList}
            isSortable={false}
            widgetsVariant="subtle"
            widgetsPopoverPosition="bottom-end"
            ref={parameterListRef}
          />
        )}
        {!isEditing && (
          <DashCardMenu
            question={question}
            result={result}
            dashcard={dashcard}
            onEditVisualization={onEditVisualization}
            openUnderlyingQuestionItems={
              onChangeCardAndRun && (cardTitle ? undefined : titleMenuItems)
            }
          />
        )}
      </Group>
    );
  }, [
    cardTitle,
    dashboard,
    dashcard,
    dashcardMenu,
    isEditing,
    editingParameter,
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

  const renderLoadingView = (loadingViewProps: LoadingViewProps) => (
    <DashCardLoadingView {...loadingViewProps} display={question?.display()} />
  );

  return (
    <div
      className={cx(CS.flexFull, CS.fullHeight, {
        [CS.pointerEventsNone]: isEditingDashboardLayout,
      })}
      ref={containerRef}
    >
      <Visualization
        className={cx(CS.flexFull, {
          [S.isNightMode]: shouldRenderAsNightMode,
          [CS.overflowAuto]: visualizationOverlay,
          [CS.overflowHidden]: !visualizationOverlay,
        })}
        dashboard={dashboard ?? undefined}
        dashcard={dashcard}
        rawSeries={series}
        visualizerRawSeries={
          isVisualizerDashboardCard(dashcard) ? rawSeries : undefined
        }
        metadata={metadata}
        mode={getClickActionMode}
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
        isNightMode={shouldRenderAsNightMode}
        isEditing={isEditing}
        isPreviewing={isPreviewing}
        isEditingParameter={isEditingParameter}
        isMobile={isMobile}
        actionButtons={actionButtons}
        replacementContent={visualizationOverlay}
        getExtraDataForClick={getExtraDataForClick}
        onUpdateVisualizationSettings={handleOnUpdateVisualizationSettings}
        onTogglePreviewing={onTogglePreviewing}
        onChangeCardAndRun={onChangeCardAndRun}
        onChangeLocation={onChangeLocation}
        renderLoadingView={renderLoadingView}
        token={token}
        uuid={uuid}
        titleMenuItems={titleMenuItems}
        errorMessageOverride={visualizerErrMsg}
      />
    </div>
  );
}
