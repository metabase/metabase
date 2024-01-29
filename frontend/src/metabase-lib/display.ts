import * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";
import { FieldDimension } from "metabase-lib/Dimension";
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

  const infos = breakouts.map(breakout => {
    const info = Lib.displayInfo(query, stageIndex, breakout);
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return { info, columnInfo };
  });

  if (aggregations.length === 1 && breakouts.length === 1) {
    const [{ columnInfo }] = infos;

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
    const [{ info, columnInfo }] = infos;

    if (isDate(columnInfo)) {
      if (info.isTemporalExtraction) {
        return { display: "bar" };
      }

      return { display: "line" };
    }

    if (
      breakoutDimensions[0] instanceof FieldDimension &&
      breakoutDimensions[0].binningStrategy()
    ) {
      return { display: "bar" };
    }

    const isCategory = false; // TODO
    if (isCategory) {
      return { display: "bar" };
    }
  }

  if (aggregations.length === 1 && breakouts.length === 2) {
    const isAnyBreakoutDate = infos.some(({ info, columnInfo }) => {
      const isDate = false; // TODO
      return isDate;
    });

    if (isAnyBreakoutDate) {
      return { display: "line" };
    }

    const areBreakoutsCoordinates = infos.every(({ info, columnInfo }) => {
      return isa(columnInfo.semanticType, TYPE.Coordinate);
    });
    if (areBreakoutsCoordinates) {
      return {
        display: "map",
        settings: {
          "map.type": "grid",
        },
      };
    }

    const areBreakoutsCategories = infos.every(({ info, columnInfo }) => {
      const isCategory = false; // TODO
      return isCategory;
    });
    if (areBreakoutsCategories) {
      return { display: "bar" };
    }
  }

  return { display: "table" };
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
