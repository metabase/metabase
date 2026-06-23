(ns metabase.explorations.composite
  "Combine multiple per-query qp-result snapshots into a single composite
  qp-result that the ephemeral document-embed card can render through the
  standard single-Card pipeline.

  Driver: the FE-sent `visualization_settings`.

  Every multi-snapshot combine appends a discriminator column whose value is
  the source `ExplorationQuery`'s hydrated `:segment_name` (the FE shows the
  same value in its live-preview legend / pivot), falling back to `(All)` when
  the EQ isn't segment-derived.

  - `N = 1` — pass-through; the lone qp-result is the composite.
  - `:table.pivot` truthy — treat as a heat-map combine. Append a
    `\"Segment\"` discriminator column. The FE hands us `:table.pivot`,
    `:table.pivot_column`, `:table.cell_column` settings that already
    reference the original cols, so they remain valid after the append.
  - Otherwise — multi-series cartesian combine. Append a `\"Series\"`
    discriminator column. The FE is expected to send
    `:graph.dimensions [<x-col> \"Series\"]` so the chart picks the new
    column up as the series breakout.

  This module is pure data — serialisation/persistence lives in
  `metabase.explorations.models.exploration-query-result`."
  (:require
   [metabase.util.i18n :refer [tru]]))

(def ^:private heat-map-segment-col-name "Segment")
(def ^:private cartesian-series-col-name "Series")

(defn- discriminator-col
  "Build the synthetic column we append to the right of the original
  cols. `:source :breakout` mirrors the FE's `getHeatMapSeries` shape so
  downstream column-resolution code treats it like a real breakout."
  [col-name]
  {:name         col-name
   :display_name col-name
   :source       :breakout})

(defn- combine-rows
  "Union rows across the source qp-results, appending the source EQ's
  hydrated `:segment_name` to each row as the discriminator value (falling
  back to `(All)` for non-segment EQs)."
  [eq-results]
  (->> eq-results
       (mapcat (fn [{:keys [eq qp-result]}]
                 (let [discriminator-value (or (:segment_name eq) (tru "(All)"))
                       rows                (get-in qp-result [:data :rows])]
                   (map #(conj (vec %) discriminator-value) rows))))
       vec))

(defn- combine-cols
  "Take the first eq-result's cols and append the discriminator column.
  All source qp-results share the same column shape upstream (they come
  from the same parent card with different filters/breakouts), so the
  first eq-result's cols are representative."
  [eq-results col-name]
  (let [first-cols (get-in (first eq-results) [:qp-result :data :cols])]
    (conj (vec first-cols) (discriminator-col col-name))))

(defn- combine-with-discriminator
  "Build a composite qp-result by appending a discriminator column to
  every row. The first eq-result supplies the structural scaffolding
  (`:status`, etc.); we replace `:data` with the merged cols + rows and
  refresh `:row_count` so downstream consumers see the new size."
  [eq-results col-name]
  (let [first-qp (:qp-result (first eq-results))
        cols    (combine-cols eq-results col-name)
        rows    (combine-rows eq-results)]
    (-> first-qp
        (assoc-in [:data :cols] cols)
        (assoc-in [:data :rows] rows)
        (assoc :row_count (count rows)))))

(defn combine
  "Combine `eq-results` (a sequence of `{:eq … :qp-result …}` maps,
  with at least one entry) into a single composite qp-result. `vs` is the
  FE-sent `visualization_settings` and drives which combine strategy to
  use."
  [eq-results vs]
  (cond
    (= 1 (count eq-results)) (:qp-result (first eq-results))
    (:table.pivot vs)        (combine-with-discriminator eq-results heat-map-segment-col-name)
    :else                    (combine-with-discriminator eq-results cartesian-series-col-name)))
