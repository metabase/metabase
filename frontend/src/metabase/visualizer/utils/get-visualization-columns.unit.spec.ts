import type {
  Dataset,
  VisualizerDataSource,
  VisualizerVizDefinition,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getVisualizationColumns } from "./get-visualization-columns";

describe("getVisualizationColumns", () => {
  describe("scalar funnel", () => {
    it("should create metric and dimension columns for scalar funnel", () => {
      const visualizerEntity: VisualizerVizDefinition = {
        display: "funnel",
        settings: {
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
        columnValuesMapping: {},
      };

      const dataSource: VisualizerDataSource = {
        id: "card:1",
        sourceId: `entity_1`,
        name: "Source 1",
        type: "card",
      };

      const dataset: Dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "Total",
              base_type: "type/Integer",
            }),
          ],
        }),
      });

      const datasets = {
        "card:1": dataset,
      };

      const dataSources = [dataSource];

      const columns = getVisualizationColumns(
        visualizerEntity,
        datasets,
        dataSources,
      );

      expect(columns).toEqual([
        {
          name: "METRIC",
          base_type: "type/Integer",
          display_name: "METRIC",
          effective_type: "type/Integer",
          field_ref: [
            "field",
            "METRIC",
            {
              "base-type": "type/Integer",
            },
          ],
          source: "artificial",
        },
        {
          name: "DIMENSION",
          base_type: "type/Text",
          display_name: "DIMENSION",
          effective_type: "type/Text",
          field_ref: [
            "field",
            "DIMENSION",
            {
              "base-type": "type/Text",
            },
          ],
          source: "artificial",
        },
      ]);
    });
  });

  describe("regular column mapping", () => {
    it("should create visualization columns from column mappings", () => {
      const visualizerEntity: VisualizerVizDefinition = {
        display: "bar",
        settings: {},
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "Date",
              sourceId: "card:1",
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "Revenue",
              sourceId: "card:1",
            },
          ],
        },
      };

      const dataSource: VisualizerDataSource = {
        id: "card:1",
        sourceId: `entity_1`,
        name: "Source 1",
        type: "card",
      };

      const dateColumn = createMockColumn({
        name: "Date",
        base_type: "type/DateTime",
        effective_type: "type/DateTime",
        semantic_type: "type/CreationTimestamp",
      });
      const revenueColumn = createMockColumn({
        name: "Revenue",
        base_type: "type/Float",
        effective_type: "type/Float",
        semantic_type: "type/Currency",
      });
      const dataset: Dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [dateColumn, revenueColumn],
        }),
      });

      const datasets = {
        "card:1": dataset,
      };

      const dataSources = [dataSource];

      const columns = getVisualizationColumns(
        visualizerEntity,
        datasets,
        dataSources,
      );

      expect(columns).toEqual([
        {
          ...dateColumn,
          name: "COLUMN_1",
        },
        {
          ...revenueColumn,
          name: "COLUMN_2",
          display_name: "Column (Source 1)",
        },
      ]);
    });

    it("should ignore missing dataset column or data source", () => {
      const visualizerEntity: VisualizerVizDefinition = {
        display: "bar",
        settings: {},
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "NonExistentColumn",
              sourceId: "card:1",
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "Revenue",
              sourceId: "card:999",
            },
          ],
        },
      };

      const dataSource: VisualizerDataSource = {
        id: "card:1",
        sourceId: `entity_1`,
        name: "Source 1",
        type: "card",
      };

      const dataset: Dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "Revenue",
              base_type: "type/Float",
            }),
          ],
        }),
      });

      const datasets = {
        "card:1": dataset,
      };

      const dataSources = [dataSource];

      const columns = getVisualizationColumns(
        visualizerEntity,
        datasets,
        dataSources,
      );

      expect(columns).toHaveLength(0);
    });
  });
});
