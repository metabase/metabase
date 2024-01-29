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

  const breakoutColumnsInfos = breakouts.map(breakout => {
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    const info = Lib.displayInfo(query, stageIndex, column);
    return info;
  });

  if (aggregations.length === 1 && breakouts.length === 1) {
    const [breakoutColumnInfo] = breakoutColumnsInfos;

    const isState = isa(breakoutColumnInfo.semanticType, TYPE.State);
    if (isState) {
      return {
        display: "map",
        settings: {
          "map.type": "region",
          "map.region": "us_states",
        },
      };
    }

    const isCountry = isa(breakoutColumnInfo.semanticType, TYPE.Country);
    if (isCountry) {
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
    const [breakoutColumnInfo] = breakoutColumnsInfos;

    const isDate = false; // TODO
    if (isDate) {
      if (breakoutColumnInfo.isTemporalExtraction) {
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
    const isAnyBreakoutDate = breakoutColumnsInfos.some(breakout => {
      const isDate = false; // TODO
      return isDate;
    });

    if (isAnyBreakoutDate) {
      return { display: "line" };
    }

    const areBreakoutsCoordinates = breakoutColumnsInfos.every(breakout => {
      return isa(breakout.semanticType, TYPE.Coordinate);
    });
    if (areBreakoutsCoordinates) {
      return {
        display: "map",
        settings: {
          "map.type": "grid",
        },
      };
    }

    const areBreakoutsCategories = breakoutColumnsInfos.every(breakout => {
      const isCategory = false; // TODO
      return isCategory;
    });
    if (areBreakoutsCategories) {
      return { display: "bar" };
    }
  }

  return { display: "table" };
};
