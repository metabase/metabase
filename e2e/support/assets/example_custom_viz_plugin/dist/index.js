var __customVizPlugin__ = (function () {
  var { jsx: e, jsxs: t, Fragment: n } = window.__METABASE_VIZ_API__.jsxRuntime,
    r = ({ getAssetUrl: e, columnTypes: t, formatValue: n, locale: r }) => (
      console.log(`DEMO VIZ`, r),
      {
        id: `demo-viz`,
        getName: () => `demo-viz`,
        minSize: { width: 1, height: 1 },
        defaultSize: { width: 2, height: 2 },
        isSensible({ cols: e, rows: t }) {
          return e.length === 1 && t.length === 1 && typeof t[0][0] == `number`;
        },
        checkRenderable(e, t) {
          if (e.length !== 1) throw Error(`Only 1 series is supported`);
          let [
            {
              data: { cols: n, rows: r },
            },
          ] = e;
          if (n.length !== 1)
            throw Error(`Query results should only have 1 column`);
          if (r.length !== 1)
            throw Error(`Query results should only have 1 row`);
          if (typeof r[0][0] != `number`) throw Error(`Result is not a number`);
          if (typeof t.threshold != `number`)
            throw Error(`Threshold setting is not set`);
        },
        settings: {
          threshold: {
            id: `1`,
            title: `Threshold`,
            widget: `number`,
            getDefault() {
              return 0;
            },
            getProps() {
              return {
                options: { isInteger: !1, isNonNegative: !1 },
                placeholder: `Set threshold`,
              };
            },
          },
        },
        VisualizationComponent: i(e),
        StaticVisualizationComponent: a(e),
      }
    ),
    i = (t) => (props) => {
      let { series, settings } = props,
        { threshold: threshold } = settings,
        value = series[0].data.rows[0][0];
      if (typeof value != `number` || typeof threshold != `number`)
        throw Error(`Value and threshold need to be numbers`);
      return e(`div`, {
        children: [
          e(`h1`, { children: `Custom viz rendered successfully` }),
          e(`div`, { children: `Threshold: ${threshold}` }),
          e(`div`, { children: `Value: ${value}` }),
        ],
      });
    },
    a = (t) => (n) => {
      let { series: r, settings: i } = n,
        { threshold: a } = i,
        o = r[0].data.rows[0][0];
      if (typeof o != `number` || typeof a != `number`)
        throw Error(`Value and threshold need to be numbers`);
      return e(`div`, {
        children: [
          e(`h1`, { children: `Custom viz rendered successfully` }),
          e(`div`, { children: `Threshold: ${threshold}` }),
          e(`div`, { children: `Value: ${value}` }),
        ],
      });
    };
  return r;
})();
