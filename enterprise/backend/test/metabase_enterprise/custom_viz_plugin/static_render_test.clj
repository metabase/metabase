(ns ^:synchronous metabase-enterprise.custom-viz-plugin.static-render-test
  "End-to-end static rendering of custom viz plugins through the REAL slim static-viz bundle on a real
  GraalVM untrusted isolate context: a plugin IIFE honoring the `globalThis.__customVizPlugin__` contract
  goes through `MetabaseStaticViz.registerCustomVizPlugin` + `renderChartJSON` and must come back as SVG.
  These are the only backend tests that execute actual plugin JS instead of mocking
  [[js.svg/*javascript-visualization*]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled true
                                       custom-viz-enabled true]
      (testing "[PRO TIP] If this test fails, you may need to rebuild the bundles with `MB_EDITION=ee bun run build-static-viz`\n"
        (thunk)))))

(defn- plugin-iife
  "A minimal custom-viz plugin bundle: an IIFE that assigns a factory to `globalThis.__customVizPlugin__`
  (the contract Vite plugin builds follow), whose StaticVisualizationComponent renders an `<svg>` labeled
  `<label>:<first cell value>`. React elements are hand-built plain objects (`$$typeof` +
  `Symbol.for('react.element')`), so no bundled React is needed for the host's ReactDOMServer to render
  them."
  [label]
  (format "globalThis.__customVizPlugin__ = function () {
  var el = function (type, props, children) {
    return {
      $$typeof: Symbol.for('react.element'),
      type: type,
      key: null,
      ref: null,
      props: children === undefined ? props : Object.assign({}, props, { children: children }),
      _owner: null,
    };
  };
  return {
    settings: {},
    StaticVisualizationComponent: function (props) {
      return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 120, height: 80 },
                el('text', { x: 10, y: 40 }, '%s:' + String(props.series[0].data.rows[0][0])));
    },
  };
};" label))

(defn- render-custom-viz
  "Render a one-cell result for a card with `display` through the real render path, evaluating and
  registering the given plugin `bundles` in the untrusted plugin context."
  [display bundles]
  (js.svg/*javascript-visualization*
   [{:card {:id 1 :name "custom viz card" :display display :visualization_settings {}}
     :data {:cols [{:name "count" :display_name "Count" :base_type :type/Integer :source :aggregation}]
            :rows [[42]]}}]
   {}
   bundles))

(deftest real-bundle-render-test
  (mt/with-premium-features #{:custom-viz}
    (testing "a real plugin IIFE registered through the real slim bundle renders an SVG carrying the card data"
      (let [{:keys [type content]} (render-custom-viz :custom:viz-a
                                                      [{:identifier "viz-a" :plugin-id 1 :source (plugin-iife "viz-a")}])]
        (is (= :svg type))
        (is (str/starts-with? (str content) "<svg"))
        (is (str/includes? (str content) "viz-a:42")
            "the plugin component should receive the raw series (data flows through the JSON boundary)")))))

(deftest no-registration-leak-between-renders-test
  (mt/with-premium-features #{:custom-viz}
    ;; In prod/CI the plugin context is pooled and reused across renders, so a registration from one render
    ;; would be visible to the next unless the render path clears it. (Under a dev-mode REPL every render
    ;; gets a fresh context and this passes trivially.)
    (testing "seed the pooled plugin context with viz-a's registration"
      (is (str/includes? (str (:content (render-custom-viz :custom:viz-a
                                                           [{:identifier "viz-a" :plugin-id 1 :source (plugin-iife "viz-a")}])))
                         "viz-a:42")))
    (testing "a following render that registers only viz-b must not see viz-a's earlier registration"
      (let [{:keys [content]} (render-custom-viz :custom:viz-a
                                                 [{:identifier "viz-b" :plugin-id 2 :source (plugin-iife "viz-b")}])]
        (is (str/blank? (str content))
            "a custom display whose plugin was not registered by THIS render must degrade to blank (the table-fallback contract), not render a stale plugin")))
    (testing "and viz-b itself renders in that same context"
      (is (str/includes? (str (:content (render-custom-viz :custom:viz-b
                                                           [{:identifier "viz-b" :plugin-id 2 :source (plugin-iife "viz-b")}])))
                         "viz-b:42")))))
