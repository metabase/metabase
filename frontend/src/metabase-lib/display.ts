import * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";
import { TYPE } from "metabase-lib/types/constants";
import { isa } from "metabase-lib/types/utils/isa";

type DefaultDisplay = {
  display: CardDisplayType;
  settings?: Partial<VisualizationSettings>;
};

export const getDefaultDisplay = (query: Lib.Query): DefaultDisplay => {
  const { isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    return { display: "table" };
  }

  const stageIndex = -1;
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);

  if (aggregations.length === 0 && breakouts.length === 0) {
    return { display: "table" };
  }

  if (aggregations.length === 1 && breakouts.length === 0) {
    return { display: "scalar" };
  }

  if (aggregations.length === 1 && breakouts.length === 1) {
    const [{ columnInfo }] = getBreakoutInfos(breakouts, query, stageIndex);

    if (isState(columnInfo)) {
      return {
        display: "map",
        settings: {
          "map.type": "region",
          "map.region": "us_states",
        },
      };
    }

    if (isCountry(columnInfo)) {
      return {
        display: "map",
        settings: {
          "map.type": "region",
          "map.region": "world_countries",
        },
      };
    }
  }

  if (aggregations.length >= 1 && breakouts.length === 1) {
    const [{ breakout, columnInfo }] = getBreakoutInfos(
      breakouts,
      query,
      stageIndex,
    );

    if (isDate(columnInfo)) {
      const info = Lib.displayInfo(query, stageIndex, breakout);

      if (info.isTemporalExtraction) {
        return { display: "bar" };
      }

      return { display: "line" };
    }

    const binning = Lib.binning(breakout);
    const isBinned = binning !== null;

    if (isBinned) {
      return { display: "bar" };
    }

    if (isCategory(columnInfo)) {
      return { display: "bar" };
    }
  }

  if (aggregations.length === 1 && breakouts.length === 2) {
    const infos = getBreakoutInfos(breakouts, query, stageIndex);

    const isAnyBreakoutDate = infos.some(({ columnInfo }) => {
      return isDate(columnInfo);
    });
    if (isAnyBreakoutDate) {
      return { display: "line" };
    }

    const areBreakoutsCoordinates = infos.every(({ columnInfo }) => {
      return isCoordinate(columnInfo);
    });
    if (areBreakoutsCoordinates) {
      return {
        display: "map",
        settings: {
          "map.type": "grid",
        },
      };
    }

    const areBreakoutsCategories = infos.every(({ columnInfo }) => {
      return isCategory(columnInfo);
    });
    if (areBreakoutsCategories) {
      return { display: "bar" };
    }
  }

  return { display: "table" };
};

const getBreakoutInfos = (
  breakouts: Lib.BreakoutClause[],
  query: Lib.Query,
  stageIndex: number,
) => {
  return breakouts.map(breakout => {
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return { breakout, columnInfo };
  });
};

const isCategory = (info: Lib.ColumnDisplayInfo): boolean => {
  return isa(info.semanticType, TYPE.Category);
};

const isCoordinate = (info: Lib.ColumnDisplayInfo): boolean => {
  return isa(info.semanticType, TYPE.Coordinate);
};

const isCountry = (info: Lib.ColumnDisplayInfo): boolean => {
  return isa(info.semanticType, TYPE.Country);
};

const isDate = (info: Lib.ColumnDisplayInfo): boolean => {
  return isa(info.effectiveType, TYPE.Temporal);
};

const isState = (info: Lib.ColumnDisplayInfo): boolean => {
  return isa(info.semanticType, TYPE.State);
};
