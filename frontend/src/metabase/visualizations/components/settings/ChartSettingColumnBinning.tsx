import { useMemo } from "react";

import { NATIVE_COLUMN_SPLIT_SETTING } from "metabase/lib/data_grid";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { ChartSettingSelect } from "./ChartSettingSelect";

interface ChartSettingColumnBinningProps {
  column: DatasetColumn;
  question: Question;
  onChangeRootSettings: (settings: VisualizationSettings) => void;
}

export const ChartSettingColumnBinning = ({
  column,
  question,
  onChangeRootSettings,
  ...rest
}: ChartSettingColumnBinningProps) => {
  const options = useMemo<Array<{ name: string; value: any }>>(() => {
    const query = question.query();
    const stageIndex = -1;

    const columnMetadata = Lib.fromLegacyColumn(query, stageIndex, column);

    const binningStrategies = Lib.availableBinningStrategies(
      query,
      stageIndex,
      columnMetadata,
    );

    if (binningStrategies.length === 0) {
      return [];
    }

    // Convert binning strategies to ChartSettingSelect options format
    return binningStrategies.map((strategy) => {
      const displayInfo = Lib.displayInfo(query, stageIndex, strategy);
      return {
        name: displayInfo.displayName,
        value: displayInfo.displayName,
      };
    });
  }, [question, column]);

  const currentValue = useMemo(() => {
    const currentSetting = question.setting(NATIVE_COLUMN_SPLIT_SETTING) || {
      rows: [],
      columns: [],
      values: [],
    };

    for (const partitionName of ["rows", "columns"] as const) {
      const partition = currentSetting[partitionName];
      const columnItem = partition.find(
        (item: any) => item.name === column.name,
      );
      if (columnItem?.binning) {
        return columnItem.binning.displayName;
      }
    }
    return undefined;
  }, [question, column]);

  const handleChange = (selectedValue: string) => {
    const query = question.query();
    const stageIndex = -1;

    const columnMetadata = Lib.fromLegacyColumn(query, stageIndex, column);

    const binningStrategies = Lib.availableBinningStrategies(
      query,
      stageIndex,
      columnMetadata,
    );

    const selectedStrategy = binningStrategies.find((strategy) => {
      const displayInfo = Lib.displayInfo(query, stageIndex, strategy);
      return displayInfo.displayName === selectedValue;
    });

    if (!selectedStrategy) {
      return;
    }

    const currentSetting = question.setting(NATIVE_COLUMN_SPLIT_SETTING) || {
      rows: [],
      columns: [],
      values: [],
    };

    const updatedSetting = { ...currentSetting };

    for (const partitionName of ["rows", "columns"] as const) {
      const partition = updatedSetting[partitionName];
      const columnIndex = partition.findIndex(
        (item: any) => item.name === column.name,
      );

      if (columnIndex !== -1) {
        const binnedColumn = Lib.withBinning(columnMetadata, selectedStrategy);
        const binning = Lib.binning(binnedColumn);
        const binningInfo = binning
          ? Lib.displayInfo(query, stageIndex, binning)
          : undefined;

        updatedSetting[partitionName] = [...partition];
        updatedSetting[partitionName][columnIndex] = {
          ...partition[columnIndex],
          binning: binningInfo,
        };
        break;
      }
    }

    onChangeRootSettings({
      [NATIVE_COLUMN_SPLIT_SETTING]: updatedSetting,
    });
  };

  return (
    <ChartSettingSelect
      {...rest}
      options={options}
      value={currentValue}
      onChange={handleChange}
    />
  );
};
