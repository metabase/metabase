import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
  CustomVisualizationProps,
} from "./viz"; // TODO: change to @metabase/custom-viz once package is published on npm

type ThumbsVizSettings = {
  threshold?: number;
};

const createThumbsViz: CreateCustomVisualization<ThumbsVizSettings> = ({
  translate: _translate,
}) => {
  return {
    id: "thumbs-viz",
    getName: () => "Thumbs",
    minSize: { width: 1, height: 1 },
    defaultSize: { width: 2, height: 2 },
    isSensible({ cols, rows }) {
      return (
        cols.length === 1 && rows.length === 1 && typeof rows[0][0] === "number"
      );
    },
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
      threshold: {
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
      },
    },
    VisualizationComponent: ThumbsVizComponent,
    StaticVisualizationComponent: ThumbsStaticVizComponent,
  };
};

const ThumbsVizComponent = (
  props: CustomVisualizationProps<ThumbsVizSettings>,
) => {
  const { height, series, settings, width } = props;
  const { threshold } = settings;
  const value = series[0].data.rows[0][0];

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  const emoji = value >= threshold ? "👍" : "👎";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width,
        height,
        fontSize: "10rem",
      }}
    >
      {emoji}
    </div>
  );
};

const ThumbsStaticVizComponent = (
  props: CustomStaticVisualizationProps<ThumbsVizSettings>,
) => {
  const width = 540;
  const height = 360;
  const { series, settings } = props;
  const { threshold } = settings;
  const value = series[0].data.rows[0][0];

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  const emoji = value >= threshold ? "👍" : "👎";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width,
        height,
        fontSize: "10rem",
      }}
    >
      {emoji}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default createThumbsViz;
