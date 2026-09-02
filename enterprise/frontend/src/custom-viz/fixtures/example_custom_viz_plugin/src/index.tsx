import { defineConfig } from "../../../src/index";
import type {
  BaseWidgetProps,
  CreateCustomVisualization,
} from "../../../src/types/viz";
import { Visualization } from "./Visualization";

type Settings = {
  threshold?: number;
  metricColumn?: string | null;
  renameQuestion?: null;
  columns?: string[];
};

function ColumnsWidget({
  value,
  onChange,
}: BaseWidgetProps<string[], Settings>) {
  return (
    <button type="button" onClick={() => onChange([...(value ?? []), "extra"])}>
      Add column from plugin
    </button>
  );
}

function RenameQuestionWidget({
  onChangeSettings,
}: BaseWidgetProps<null, Settings>) {
  return (
    <button
      type="button"
      onClick={() =>
        onChangeSettings({
          // @ts-expect-error -- the SDK type rejects internal Metabase setting ids on purpose
          "card.title": "Plugin title",
          threshold: 7,
        })
      }
    >
      Rename question from plugin
    </button>
  );
}

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  locale,
}) => {
  return defineConfig<Settings>({
    id: "example_custom_viz_plugin",
    getName: () => "example_custom_viz_plugin",
    minSize: { width: 2, height: 2 },
    checkRenderable(series, settings) {
      if (series.length !== 1) {
        throw new Error("Only 1 series is supported");
      }

      const [
        {
          data: { cols, rows },
        },
      ] = series;

      if (cols.length !== 1) {
        throw new Error("Query results should only have 1 column");
      }

      if (rows.length !== 1) {
        throw new Error("Query results should only have 1 row");
      }

      if (typeof rows[0][0] !== "number") {
        throw new Error("Result is not a number");
      }

      if (typeof settings.threshold !== "number") {
        throw new Error("Threshold setting is not set");
      }
    },
    settings: {
      threshold: defineSetting({
        id: "threshold",
        title: "Threshold",
        widget: "number",
        getDefault() {
          return 0;
        },
        getProps() {
          return {
            options: {
              isInteger: false,
              isNonNegative: false,
            },
            placeholder: "Set threshold",
          };
        },
      }),
      metricColumn: defineSetting({
        id: "metricColumn",
        title: "Metric column",
        widget: "field",
        getDefault(series) {
          return series[0].data.cols[0]?.name;
        },
        getProps(series) {
          const columns = series[0].data.cols;
          return {
            columns,
            options: columns.map((col) => ({
              name: col.display_name,
              value: col.name,
            })),
            showColumnSetting: true,
          };
        },
      }),
      renameQuestion: defineSetting({
        id: "renameQuestion",
        title: "Rename question",
        widget: RenameQuestionWidget,
        getDefault() {
          return null;
        },
      }),
      columns: defineSetting({
        id: "columns",
        title: "Columns",
        widget: ColumnsWidget,
        getDefault(series) {
          return series[0].data.cols.map((col) => col.name);
        },
      }),
    },
    VisualizationComponent: (props) => (
      <Visualization {...props} locale={locale} />
    ),
  });
};

export default createVisualization;
