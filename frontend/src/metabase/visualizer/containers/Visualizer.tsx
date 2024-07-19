import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  useSensor,
} from "@dnd-kit/core";
import type { Location } from "history";
import { useEffect, useMemo, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { WithRouterProps } from "react-router";
import { useMount, usePrevious } from "react-use";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import type { OnChangeCardAndRun } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";

import { QueryEditorModal } from "../components/QueryEditorModal";
import { handleDragEnd } from "../dnd";
import { useVisualizerSeries } from "../hooks/useVisualizerSeries";

import { VisualizerCanvas } from "./VisualizerCanvas";
import { VisualizerMenu } from "./VisualizerMenu/VisualizerMenu";
import { VisualizerUsed } from "./VisualizerUsed";

export function Visualizer({ router, location }: WithRouterProps) {
  const [focusedSeriesIndex, setFocusedSeriesIndex] = useState<number | null>(
    null,
  );

  const [vizType, _setVizType] = useState("bar");
  const [isVizSettingsOpen, setVizSettingsOpen] = useState(false);

  const metadata = useSelector(getMetadata);

  const previousLocation = usePrevious(location);

  const {
    series,
    transformedSeries,
    settings,
    question,
    addCardSeries,
    replaceSeries,
    replaceAllWithCardSeries,
    refreshSeriesData,
    removeSeries,
    setVizSettings,
    updateSeriesCard,
    updateSeriesQuery,
  } = useVisualizerSeries(getInitialCards(location), {
    onSeriesChange: nextSeries => {
      const cards = nextSeries.map(({ card }) => card);
      const hash = Urls.encodeVisualizerState(cards);
      router.push({ ...location, hash: hash ? `#${hash}` : undefined });
    },
  });

  useMount(() => {
    const [card] = getInitialCards(location);
    if (card) {
      if (card.display === "scalar") {
        _setVizType(
          card.visualization_settings?.["scalar.multiseries.display"] ??
            "scalar",
        );
      } else {
        _setVizType(card.display);
      }
    }
  });

  useEffect(() => {
    if (previousLocation && location.hash !== previousLocation.hash) {
      const seriesCards = series.map(({ card }) => card);
      const hashCards = getInitialCards(location);
      if (!_.isEqual(seriesCards, hashCards)) {
        replaceSeries(hashCards);
      }
    }
  }, [series, location, previousLocation, replaceSeries, router]);

  const focusedQuestion = useMemo(() => {
    if (focusedSeriesIndex === null || !series[focusedSeriesIndex]) {
      return null;
    }
    const { card } = series[focusedSeriesIndex];
    return new Question(card, metadata);
  }, [series, focusedSeriesIndex, metadata]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });

  const handleChangeVizType = (display: string) => {
    _setVizType(display);
    if (series.length === 0) {
      return;
    }
    const [{ card }] = series;
    if (card.display === "scalar") {
      updateSeriesCard(0, {
        visualization_settings: {
          ...card.visualization_settings,
          "scalar.multiseries.display": display,
        },
      });
    } else {
      updateSeriesCard(0, { display });
    }
  };

  const handleChangeQuery = (question: Question) => {
    if (typeof focusedSeriesIndex === "number") {
      updateSeriesQuery(focusedSeriesIndex, question.datasetQuery());
    }
  };

  const handleChangeCardAndRun: OnChangeCardAndRun = ({ nextCard }) => {
    updateSeriesCard(0, nextCard, { makeAdHoc: true, runQuery: true });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (question) {
      const nextVizSettings = handleDragEnd(event, question.settings());
      setVizSettings(nextVizSettings);
    }
  };

  return (
    <>
      <DndContext sensors={[mouseSensor]} onDragEnd={onDragEnd}>
        <PanelGroup direction="horizontal" style={{ padding: 20 }}>
          {!isVizSettingsOpen && (
            <Panel defaultSize={25} minSize={15}>
              <PanelGroup direction="vertical">
                <Panel defaultSize={70} minSize={20} maxSize={80}>
                  <VisualizerMenu
                    series={series}
                    onAdd={item => addCardSeries(item.id)}
                    onReplace={item => replaceAllWithCardSeries(item.id)}
                  />
                </Panel>
                <ResizeHandle direction="horizontal" />
                <Panel defaultSize={30}>
                  <VisualizerUsed
                    series={series}
                    onFocusSeries={setFocusedSeriesIndex}
                    onVizTypeChange={(index, display) => {
                      updateSeriesCard(index, { display });
                    }}
                    onRefreshData={refreshSeriesData}
                    onRemoveSeries={removeSeries}
                  />
                </Panel>
              </PanelGroup>
            </Panel>
          )}
          <ResizeHandle direction="vertical" />
          <Panel defaultSize={75} minSize={60}>
            <VisualizerCanvas
              series={series}
              transformedSeries={transformedSeries}
              settings={settings}
              vizType={vizType}
              onToggleVizSettings={() => setVizSettingsOpen(isOpen => !isOpen)}
              onVizTypeChange={handleChangeVizType}
              onChange={setVizSettings}
              onChangeCardAndRun={handleChangeCardAndRun}
            />
          </Panel>
          {isVizSettingsOpen && (
            <Panel defaultSize={20} minSize={20}>
              <ChartSettings
                question={question}
                series={series}
                computedSettings={settings}
                noPreview
                onChange={setVizSettings}
                onClose={() => setVizSettingsOpen(false)}
              />
            </Panel>
          )}
        </PanelGroup>
      </DndContext>
      <QueryEditorModal
        question={focusedQuestion}
        onChange={handleChangeQuery}
        onClose={() => setFocusedSeriesIndex(null)}
      />
    </>
  );
}

function getInitialCards(location: Location) {
  if (!location.hash) {
    return [];
  }
  try {
    const result = Urls.decodeVisualizerState(location.hash);
    return Array.isArray(result) ? result : [];
  } catch (e) {
    // pass
    return [];
  }
}

function ResizeHandle({ direction }: { direction: "horizontal" | "vertical" }) {
  const style =
    direction === "horizontal"
      ? { width: 20, height: 4, margin: "0 auto" }
      : { width: 4, height: 20, margin: "auto 0" };

  return (
    <PanelResizeHandle
      style={{
        display: "flex",
        margin: 4,
        cursor: direction === "horizontal" ? "row-resize" : "col-resize",
      }}
    >
      <span
        style={{
          ...style,
          backgroundColor: "#ddd",
          borderRadius: 99,
        }}
      ></span>
    </PanelResizeHandle>
  );
}
