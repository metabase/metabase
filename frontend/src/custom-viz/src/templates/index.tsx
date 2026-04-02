import {
  type CreateCustomVisualization,
  type CustomStaticVisualizationProps,
  type CustomVisualizationProps,
  defineSetting,
} from "../";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  getAssetUrl,
}) => {
  const VisualizationComponent = (
    props: CustomVisualizationProps<Settings>,
  ) => {
    const { height, series, settings, width } = props;
    const { threshold } = settings;
    const value = series[0].data.rows[0][0];

    if (!height || !width) {
      return null;
    }

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

  const StaticVisualizationComponent = (
    props: CustomStaticVisualizationProps<Settings>,
  ) => {
    const width = 540;
    const height = 360;
    const { series, settings } = props;
    const { threshold } = settings;
    const value = series[0].data.rows[0][0];

    if (typeof value !== "number" || typeof threshold !== "number") {
      throw new Error("Value and threshold need to be numbers");
    }

    const emoji =
      value >= threshold ? (
        <img src={getAssetUrl("thumbs-up.png")} />
      ) : (
        <img src={getAssetUrl("thumbs-down.png")} />
      );

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

  return {
    id: "__CUSTOM_VIZ_NAME__",
    getName: () => "__CUSTOM_VIZ_NAME__",
    minSize: { width: 4, height: 4 },
    defaultSize: { width: 4, height: 4 },
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
        id: "1",
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
    },
    VisualizationComponent,
    StaticVisualizationComponent,
  };
};

export default createVisualization;
