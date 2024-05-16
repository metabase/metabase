import { useState } from "react";
import _ from "underscore";

import { cardApi } from "metabase/api";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Card, Grid, Stack, Switch } from "metabase/ui";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card as ICard, Series } from "metabase-types/api";

import { DataPanel } from "./DataPanel";
import { SeriesSettings } from "./SeriesSettings";
import { areSeriesCompatible } from "./utils";

export function Visualizer() {
  const [charts, setCharts] = useState<Series[]>([]);
  const [areTooltipsEnabled, setEnableTooltips] = useState(true);

  const [focusedSeriesIndexes, setFocusedSeriesIndexes] = useState<{
    chartIndex: number;
    seriesIndex: number;
  }>({ chartIndex: -1, seriesIndex: -1 });

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const focusedSeries =
    charts[focusedSeriesIndexes.chartIndex]?.[focusedSeriesIndexes.seriesIndex];

  const handleAddCard = async (card: ICard) => {
    const { data: dataset } = await dispatch(
      cardApi.endpoints.cardQuery.initiate(card.id),
    );

    if (!dataset) {
      return;
    }

    const series = { card, data: dataset.data };

    const focusedChartIndex = focusedSeriesIndexes.chartIndex;
    const mainChart = charts[focusedChartIndex];

    if (!mainChart) {
      setCharts([...charts, [series]]);
      return;
    }

    const mainSeries = mainChart?.[0];
    const mainCard = mainSeries?.card;

    if (mainCard) {
      const canMerge = areSeriesCompatible(mainSeries, series);
      if (canMerge) {
        const nextMainChart = [...mainChart, series];
        const nextCharts = charts.map((chart, index) =>
          index === focusedChartIndex ? nextMainChart : chart,
        );
        setCharts(nextCharts);
      } else {
        setCharts([...charts, [series]]);
      }
    } else {
      setCharts([...charts, [series]]);
    }
  };

  const handleChangeFocusedSeriesCard = (card: ICard) => {
    const { chartIndex, seriesIndex } = focusedSeriesIndexes;
    const nextCharts = charts.map((chart, index) => {
      if (index !== chartIndex) {
        return chart;
      }

      return chart.map((series, index) => {
        if (index !== seriesIndex) {
          return series;
        }

        return { ...series, card };
      });
    });
    setCharts(nextCharts);
  };

  return (
    <Grid p="md" w="100%" h="100%">
      <Grid.Col span={2}>
        <DataPanel onAddCard={handleAddCard} />
      </Grid.Col>
      <Grid.Col span={8}>
        <Card
          withBorder
          w="100%"
          mih="100%"
          onClick={() => {
            setFocusedSeriesIndexes({ chartIndex: -1, seriesIndex: -1 });
          }}
          style={{ overflow: "auto" }}
        >
          {charts.map((series, index) => (
            <Chart
              key={index}
              series={series}
              isFocused={index === focusedSeriesIndexes.chartIndex}
              areTooltipsEnabled={areTooltipsEnabled}
              metadata={metadata}
              onWrapperClick={event => {
                event.stopPropagation();
                setFocusedSeriesIndexes({ chartIndex: index, seriesIndex: 0 });
              }}
              onVisualizationClick={clicked => {
                setFocusedSeriesIndexes({
                  chartIndex: index,
                  seriesIndex: clicked.seriesIndex,
                });
              }}
            />
          ))}
        </Card>
      </Grid.Col>
      <Grid.Col span={2}>
        <Stack spacing="1rem">
          <Button variant="filled" onClick={() => setCharts([])}>
            Reset all
          </Button>
          <Switch
            checked={areTooltipsEnabled}
            label="Tooltips"
            onChange={event => setEnableTooltips(event.target.checked)}
          />
        </Stack>
        {focusedSeries && (
          <div style={{ marginTop: "18px" }}>
            <SeriesSettings
              series={focusedSeries}
              onChange={handleChangeFocusedSeriesCard}
            />
          </div>
        )}
      </Grid.Col>
    </Grid>
  );
}

interface ChartProps {
  series: Series;
  isFocused: boolean;
  areTooltipsEnabled?: boolean;
  metadata: Metadata;
  onWrapperClick: (event: React.MouseEvent) => void;
  onVisualizationClick: (clicked: {
    event: React.MouseEvent;
    seriesIndex: number;
  }) => void;
}

function Chart({
  series,
  isFocused,
  areTooltipsEnabled,
  metadata,
  onWrapperClick,
  onVisualizationClick,
}: ChartProps) {
  return (
    <div
      onClick={onWrapperClick}
      style={{
        width: "600px",
        height: "600px",
        padding: "12px",
        border: isFocused ? `1px solid ${color("brand")}` : undefined,
      }}
    >
      <BaseVisualization
        rawSeries={series}
        metadata={metadata}
        enableHover={areTooltipsEnabled}
        handleVisualizationClick={clicked => {
          clicked.event.stopPropagation();
          onVisualizationClick(clicked);
        }}
      />
    </div>
  );
}
