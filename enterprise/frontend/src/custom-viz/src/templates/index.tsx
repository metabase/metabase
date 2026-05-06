import {
  type CreateCustomVisualization,
  type CustomVisualizationProps,
  defineConfig,
} from "../";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  getAssetUrl,
}) => {
  const VisualizationComponent = ({
    height,
    series,
    settings,
    width,
  }: CustomVisualizationProps<Settings>) => {
    const { threshold } = settings;
    const value = series[0].data.rows[0][0];

    if (!height || !width) {
      return null;
    }

    if (typeof value !== "number" || typeof threshold !== "number") {
      throw new Error("Value and threshold need to be numbers");
    }

    const meetsThreshold = value >= threshold;
    const finalHeight = Math.min(height * 0.8, 256);

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <img
          alt={meetsThreshold ? "Above threshold" : "Below threshold"}
          src={
            meetsThreshold
              ? getAssetUrl("thumbs-up.png")
              : getAssetUrl("thumbs-down.png")
          }
          style={{
            height: finalHeight,
            width: "auto",
          }}
        />
      </div>
    );
  };

  return defineConfig<Settings>({
    id: "__CUSTOM_VIZ_NAME__",
    getName: () => "__CUSTOM_VIZ_DISPLAY_NAME__",
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
    },
    VisualizationComponent,
  });
};

export default createVisualization;
