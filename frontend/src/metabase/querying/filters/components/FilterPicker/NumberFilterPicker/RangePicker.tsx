import { RangeSlider } from "@mantine/core";
import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn, RawSeries } from "metabase-types/api";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  clicked: Lib.ClickObject;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

export const RangePicker = ({
  query,
  stageIndex,
  column,
  clicked,
  values,
  onChange,
}: Props) => {
  const distributionQuery = useMemo(
    () => getDistributionQuery(query, stageIndex, clicked.column),
    [query, stageIndex, clicked.column],
  );
  const legacyQuery = useMemo(
    () => Lib.toLegacyQuery(distributionQuery),
    [distributionQuery],
  );
  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return new Question(distributionQuery, metadata).setDisplay("bar");
  }, [distributionQuery, metadata]);

  const { data } = useGetAdhocQueryQuery(legacyQuery);
  const rawSeries = useMemo<RawSeries | undefined>(() => {
    if (!data) {
      return undefined;
    }

    const card = question.card();

    // hackathon
    card.chartMeasurements = {
      padding: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      bounds: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    };

    return [
      {
        data: data.data,
        card,
      },
    ];
  }, [data, question]);

  const fingerprintTypeInfo =
    clicked.column?.fingerprint?.type?.["type/Number"];
  const { min, max } = fingerprintTypeInfo ?? {
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
  };
  const minRange = (max - min) / 100;

  const value =
    values.length === 2 && values[0] != null && values[1] != null
      ? [formatNumber(values[0]), formatNumber(values[1])]
      : [min, max];

  return (
    <Box h={75} pt="0.5rem">
      <Visualization
        rawSeries={rawSeries}
        metadata={metadata}
        showAllLegendItems={false}
        isCompact
        settingsOverride={{
          "graph.show_values": false,
          "graph.x_axis.labels_enabled": false,
          "graph.y_axis.labels_enabled": false,
          "graph.y_axis.axis_enabled": false,
          "graph.x_axis.axis_enabled": false,
          "series_settings.colors": {
            count: "#CBE2F7",
          },
        }}
      />

      {data && (
        <Box px="1rem" pos="relative" top="-1rem">
          <RangeSlider
            minRange={isNumber(minRange) ? formatNumber(minRange) : undefined}
            min={isNumber(min) ? formatNumber(min) : undefined}
            max={isNumber(max) ? formatNumber(max) : undefined}
            step={isNumber(minRange) ? formatNumber(minRange) : undefined}
            label={null}
            value={
              isNumber(value[1]) && isNumber(value[0])
                ? value.map(formatNumber)
                : [min, max]
            }
            styles={{
              track: {
                background: "#EDF2F5",
              },
            }}
            onChange={values => {
              onChange(values.map(formatNumber));
            }}
          />
        </Box>
      )}
    </Box>
  );
};

function getDistributionQuery(
  query: Lib.Query,
  stageIndex: number,
  column: DatasetColumn | undefined,
): Lib.Query {
  if (!column) {
    return query;
  }

  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    undefined,
    column,
    undefined,
    undefined,
    undefined,
  );
  const distributionDrill = drills.find(drill => {
    const info = Lib.displayInfo(query, stageIndex, drill);
    return info.type === "drill-thru/distribution";
  });

  if (!distributionDrill) {
    return query;
  }

  return Lib.drillThru(query, stageIndex, undefined, distributionDrill);
}

function isNumber(num: unknown): num is number {
  return typeof num === "number" && Number.isFinite(num) && !Number.isNaN(num);
}

function formatNumber(value: NumberOrEmptyValue): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "bigint") {
    throw new Error("Bigint not supported");
  }
  return parseFloat(value.toFixed(2));
}
