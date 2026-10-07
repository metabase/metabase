(ns metabase.explorations.composite
  "Combine multiple per-query qp-result snapshots into a single composite
  qp-result that the ephemeral document-embed card can render through the
  standard single-Card pipeline.

  Driver: the FE-sent `visualization_settings`.

  Every multi-snapshot combine appends a discriminator column whose value
  identifies the source `ExplorationQuery` — its hydrated `:segment_name` (the
  FE shows the same value in its live-preview legend / pivot), falling back to
  the EQ's own `:name`, then to `(All)`. The values are then made unique: two
  sources sharing a label would otherwise collapse into a single series.

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

(defn- discriminator-col
  "Build the synthetic column we append to the right of the original
  cols. `:name` is the untranslated protocol key; `:display_name` is
  localized. `:source :breakout` mirrors the FE's `getHeatMapSeries`
  shape so downstream column-resolution code treats it like a real
  breakout.

  The composite result is handed to the FE verbatim, so this column has to carry
  the same type keys every real col does — the FE formats by `:base_type` and
  resolves a `graph.dimensions` entry to a column by `:field_ref`. The values
  are always the discriminator strings [[combine-rows]] appends, hence
  `:type/Text`; the `[:field \"name\" …]` ref is the shape a native query's cols
  use for a column that has no Field behind it."
  [col-name display-name]
  {:name           col-name
   :display_name   display-name
   :base_type      :type/Text
   :effective_type :type/Text
   :field_ref      [:field col-name {:base-type :type/Text}]
   :source         :breakout})

(defn- discriminator-values
  "One discriminator value per eq-result, positionally aligned with `eq-results`.

  The label is the EQ's hydrated `:segment_name`, then its own `:name`, then
  `(All)`. Whatever the source, the values must be *distinct*: they are the
  series/pivot key, so two sources sharing one would render as a single series
  carrying both sources' rows. Only labels that actually repeat are suffixed
  with their 1-based position, which leaves the common shape — one unlabeled
  \"(All)\" query alongside named segments — reading exactly as before."
  [eq-results]
  (let [labels (mapv (fn [{:keys [eq]}]
                       (or (not-empty (:segment_name eq))
                           (not-empty (:name eq))
                           (tru "(All)")))
                     eq-results)
        dupes  (into #{} (keep (fn [[label n]] (when (> n 1) label)))
                     (frequencies labels))]
    (into []
          (map-indexed (fn [i label]
                         (if (contains? dupes label)
                           (str label " " (inc i))
                           label)))
          labels)))

(defn- combine-rows
  "Union rows across the source qp-results, appending each source's
  discriminator value (see [[discriminator-values]]) to every one of its rows."
  [eq-results]
  (vec (mapcat (fn [{:keys [qp-result]} discriminator-value]
                 (map #(conj (vec %) discriminator-value) (get-in qp-result [:data :rows])))
               eq-results
               (discriminator-values eq-results))))

(defn- combine-cols
  "Take the first eq-result's cols and append the discriminator column.
  All source qp-results share the same column shape upstream (they come
  from the same parent card with different filters/breakouts), so the
  first eq-result's cols are representative."
  [eq-results col-name display-name]
  (let [first-cols (get-in (first eq-results) [:qp-result :data :cols])]
    (conj (vec first-cols) (discriminator-col col-name display-name))))

(defn- combine-with-discriminator
  "Build a composite qp-result by appending a discriminator column to
  every row. The first eq-result supplies the structural scaffolding
  (`:status`, etc.); we replace `:data` with the merged cols + rows and
  refresh `:row_count` so downstream consumers see the new size."
  [eq-results col-name display-name]
  (let [first-qp (:qp-result (first eq-results))
        cols     (combine-cols eq-results col-name display-name)
        rows     (combine-rows eq-results)]
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
    (:table.pivot vs)        (combine-with-discriminator eq-results "Segment" (tru "Segment"))
    :else                    (combine-with-discriminator eq-results "Series" (tru "Series"))))
