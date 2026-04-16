var __customVizPlugin__ = (function () {
  var React = window.__METABASE_VIZ_API__.React;
  var jsxRuntime = window.__METABASE_VIZ_API__.jsxRuntime;
  var jsx = jsxRuntime.jsx;
  var jsxs = jsxRuntime.jsxs;

  function createPlugin(factoryProps) {
    var locale = factoryProps.locale;

    function VisualizationComponent(props) {
      var series = props.series;
      var settings = props.settings;
      var onClick = props.onClick;
      var onHover = props.onHover;
      var threshold = settings.threshold;
      var data = series[0].data;
      var cols = data.cols;
      var rows = data.rows;
      var value = rows[0][0];

      var lastClickState = React.useState(null);
      var lastClickValue = lastClickState[0];
      var setLastClickValue = lastClickState[1];

      var lastHoverState = React.useState(null);
      var lastHoverValue = lastHoverState[0];
      var setLastHoverValue = lastHoverState[1];

      if (typeof value !== "number" || typeof threshold !== "number") {
        throw new Error("Value and threshold need to be numbers");
      }

      function handleClick(ev) {
        setLastClickValue(value);
        onClick({
          value: value,
          column: cols[0],
          settings: settings,
          event: ev.nativeEvent,
          element: ev.currentTarget,
          origin: { row: rows[0], cols: cols },
          data: [{ key: cols[0].name, value: value, col: cols[0] }],
        });
      }

      function handleHoverEnter(ev) {
        setLastHoverValue(value);
        onHover({
          value: value,
          column: cols[0],
          event: ev.nativeEvent,
          element: ev.currentTarget,
          data: [{ key: cols[0].name, value: value, col: cols[0] }],
        });
      }

      function handleHoverLeave() {
        onHover(null);
      }

      return jsxs("div", {
        children: [
          jsx("h1", { children: "Custom viz rendered successfully" }),
          jsx("div", { children: "Threshold: " + threshold }),
          jsx("div", { children: "Value: " + value }),
          jsx("div", {
            "data-testid": "demo-viz-locale",
            children: "Locale: " + locale,
          }),
          jsx("button", {
            type: "button",
            "data-testid": "demo-viz-click-target",
            onClick: handleClick,
            children: "Click me",
          }),
          jsx("div", {
            "data-testid": "demo-viz-hover-target",
            onMouseEnter: handleHoverEnter,
            onMouseLeave: handleHoverLeave,
            children: "Hover me",
          }),
          jsx("div", {
            "data-testid": "demo-viz-last-click",
            children:
              "Last clicked: " +
              (lastClickValue === null ? "none" : lastClickValue),
          }),
          jsx("div", {
            "data-testid": "demo-viz-last-hover",
            children:
              "Last hovered: " +
              (lastHoverValue === null ? "none" : lastHoverValue),
          }),
        ],
      });
    }

    function StaticVisualizationComponent(props) {
      var series = props.series;
      var settings = props.settings;
      var threshold = settings.threshold;
      var value = series[0].data.rows[0][0];

      if (typeof value !== "number" || typeof threshold !== "number") {
        throw new Error("Value and threshold need to be numbers");
      }

      return jsxs("div", {
        children: [
          jsx("h1", { children: "Custom viz rendered successfully" }),
          jsx("div", { children: "Threshold: " + threshold }),
          jsx("div", { children: "Value: " + value }),
          jsx("div", { children: "Locale: " + locale }),
        ],
      });
    }

    return {
      id: "demo-viz",
      getName: function () {
        return "demo-viz";
      },
      minSize: { width: 1, height: 1 },
      defaultSize: { width: 2, height: 2 },
      checkRenderable: function (series, settings) {
        if (series.length !== 1) {
          throw new Error("Only 1 series is supported");
        }
        var data = series[0].data;
        if (data.cols.length !== 1) {
          throw new Error("Query results should only have 1 column");
        }
        if (data.rows.length !== 1) {
          throw new Error("Query results should only have 1 row");
        }
        if (typeof data.rows[0][0] !== "number") {
          throw new Error("Result is not a number");
        }
        if (typeof settings.threshold !== "number") {
          throw new Error("Threshold setting is not set");
        }
      },
      settings: {
        threshold: {
          id: "1",
          title: "Threshold",
          widget: "number",
          getDefault: function () {
            return 0;
          },
          getProps: function () {
            return {
              options: { isInteger: false, isNonNegative: false },
              placeholder: "Set threshold",
            };
          },
        },
      },
      VisualizationComponent: VisualizationComponent,
      StaticVisualizationComponent: StaticVisualizationComponent,
    };
  }

  return createPlugin;
})();
