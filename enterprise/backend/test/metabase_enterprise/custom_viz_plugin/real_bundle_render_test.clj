(ns ^:synchronous metabase-enterprise.custom-viz-plugin.real-bundle-render-test
  "Static-renders a REAL custom-viz plugin bundle through the REAL slim static-viz bundle on the
  untrusted GraalVM isolate — nothing at the JS boundary is mocked. The plugin source is the same
  prebuilt example plugin the e2e suite uploads (`static rendering — subscriptions` in
  `custom-viz.cy.spec.ts`, until now the only real-bundle coverage)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn warn-possible-rebuild [thunk]
    (testing "[PRO TIP] If this test fails, you may need to rebuild the bundles with `MB_EDITION=ee bun run build-static-viz`\n"
      (thunk))))

(def ^:private example-plugin-source
  "JS source of the prebuilt example plugin — a Vite IIFE that assigns its factory to
  `globalThis.__customVizPlugin__`, exactly what an uploaded bundle resolves to at render time."
  (delay
    (mt/with-temp-dir [dir "custom-viz-real-bundle-test"]
      (u.compress/untgz (io/file "e2e/support/assets/example_custom_viz_plugin.tgz") (io/file dir))
      (slurp (io/file dir "dist" "index.js")))))

(def ^:private count-data
  "The e2e block's aggregation shape: one count column, one row. Being 1×1 it also exercises the
  detection guard (custom viz before scalar) live through the whole render."
  {:cols [{:name          "count"
           :display_name  "Count"
           :base_type     :type/BigInteger
           :semantic_type :type/Quantity
           :source        "aggregation"
           :field_ref     [:aggregation 0]}]
   :rows [[18760]]})

(defn- render!
  "Static-render a card displaying `custom:<card-identifier>`, registering the example plugin bundle
  under `bundle-identifier`, on the real slim bundle + isolate. The two identifiers differ only in
  the stale-registration test below."
  [card-identifier bundle-identifier & {:keys [dashcard-settings]
                                        :or   {dashcard-settings {}}}]
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temporary-setting-values [csp-img-enabled true
                                       custom-viz-enabled true]
      (js.svg/*javascript-visualization*
       [{:card {:id                     1
                :name                   "Custom Viz Card"
                :display                (str "custom:" card-identifier)
                :visualization_settings {:threshold 0}}
         :data count-data}]
       dashcard-settings
       [{:identifier bundle-identifier :plugin-id 1 :source @example-plugin-source}]))))

(deftest real-plugin-bundle-renders-svg-test
  (testing "a real plugin IIFE through registerCustomVizPlugin + renderChartJSON produces an SVG"
    (let [{:keys [type content]} (render! "demo-viz" "demo-viz")]
      (is (= :svg type))
      (is (str/starts-with? (str content) "<svg")))))

(deftest dashcard-settings-reach-the-plugin-test
  (testing "dashcard-level viz settings override the card's (a threshold above the value flips the example plugin's arrow)"
    (let [{:keys [type content]} (render! "demo-viz" "demo-viz" :dashcard-settings {:threshold 999999})]
      (is (= :svg type))
      (is (str/includes? (str content) "rotate(-180")))))

(deftest pooled-context-registration-survives-across-renders-test
  ;; FIXME: this is a characterization test pinning CURRENT behavior, which we believe is a bug —
  ;; the pooled plugin context's registry retains registrations from earlier renders, so bundle A's
  ;; viz keeps serving cards after a later render registered only bundle B (think plugin upgrade, or
  ;; a card whose plugin was disabled between sends). Intended behavior: a render serves only the
  ;; bundles it registered — the second render below should produce blank content (→ table
  ;; fallback). When that is fixed, flip these assertions.
  (with-redefs [config/is-dev? false] ; force the pooled (prod/CI) context path even in a dev REPL
    (testing "sanity: bundle A registers and renders on the pooled context"
      (is (= :svg (:type (render! "leak-a" "leak-a")))))
    (testing "a later render that registers only bundle B is still served by bundle A's stale registration"
      (let [{:keys [content]} (render! "leak-a" "leak-b")]
        (is (str/starts-with? (str content) "<svg")
            "stale-registration leak no longer reproduces — flip this test to assert blank content instead")))))
