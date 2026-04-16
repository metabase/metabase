import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
  CustomVisualizationProps,
} from "../";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
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
        <svg
          width={(finalHeight * 17) / 16}
          height={finalHeight}
          viewBox="0 0 17 16"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7.06606 2.19223C7.18717 1.92309 7.45487 1.75 7.75 1.75H8.25C9.49264 1.75 10.5 2.75736 10.5 4V6.25H13.3456C14.5486 6.25 15.3929 7.43567 14.9994 8.57244L13.4417 13.0724C13.1977 13.7773 12.5338 14.25 11.7879 14.25H3.25C2.55964 14.25 2 13.6904 2 13V8C2 7.30964 2.55964 6.75 3.25 6.75H5.01506L7.06606 2.19223ZM4.75 8.25H3.5V12.75H4.75V8.25ZM6.25 12.75H11.7879C11.8945 12.75 11.9893 12.6825 12.0242 12.5818L13.5819 8.08178C13.6381 7.91938 13.5175 7.75 13.3456 7.75H9.75C9.33579 7.75 9 7.41421 9 7V4C9 3.58579 8.66421 3.25 8.25 3.25H8.23494L6.25 7.66098V12.75Z"
            fill="var(--mb-color-brand)"
            transform={meetsThreshold ? undefined : "rotate(-180 8.54854 8)"}
          />
        </svg>
      </div>
    );
  };

  const StaticVisualizationComponent = (
    props: CustomStaticVisualizationProps<Settings>,
  ) => {
    const { series, settings } = props;
    const { threshold } = settings;
    const value = series[0].data.rows[0][0];

    if (typeof value !== "number" || typeof threshold !== "number") {
      throw new Error("Value and threshold need to be numbers");
    }

    const meetsThreshold = value >= threshold;

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: 540,
          height: 360,
        }}
      >
        {meetsThreshold ? (
          <img src={getAssetUrl("thumbs-up.png")} />
        ) : (
          <img src={getAssetUrl("thumbs-down.png")} />
        )}
      </div>
    );
  };

  return {
    id: "__CUSTOM_VIZ_NAME__",
    getName: () => "__CUSTOM_VIZ_NAME__",
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
    StaticVisualizationComponent,
  };
};

export default createVisualization;
