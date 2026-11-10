(ns metabase.lib.schema.visualization-settings
  "Schemas for the visualization settings the frontend authors for cards, dashboard cards and the like, normalizing
  them to the shape their columns store: keyword keys all the way down, but for the JSON-encoded column keys of
  `:column_settings`, with the legacy MBQL references that older settings give in place of column names normalized."
  (:refer-clojure :exclude [update-keys])
  (:require
   #?(:clj [metabase.util.i18n :as i18n])
   #?@(:clj ([malli.core :as mc]
             [malli.transform :as mtx]
             [metabase.util.json :as json]
             [metabase.util.memoize :as u.memo]))
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [update-keys keywordize-keys]]))

(mr/def ::legacy-reference
  "A legacy MBQL reference to a column, as older settings give it."
  [:ref :metabase.legacy-mbql.schema/Reference])

(mr/def ::column-name-or-ref
  "How a setting refers to a column: by name, as newer settings do, by legacy MBQL reference, as older ones do, or by
  something else the frontend wrote, which is kept as it is."
  [:or :string ::legacy-reference :any])

(mr/def ::click-behavior.dimension
  "The `:dimension` a click behavior parameter maps to, with the legacy MBQL reference of its column."
  [:or
   [:tuple [:= {:decode/normalize lib.schema.common/normalize-string-key} "dimension"] [:maybe ::legacy-reference]]
   [:tuple [:= {:decode/normalize lib.schema.common/normalize-string-key} "dimension"] [:maybe ::legacy-reference] :map]
   :any])

(mr/def ::click-behavior
  "The `:click_behavior` of a visualization or column: what clicking a value does, with the dimensions its parameters
  map to."
  [:map {:closed false, ::mr/deliberately-open true, :description "click behavior"}
   [:parameterMapping {:optional true}
    [:maybe [:map-of :any [:maybe [:map {:closed false, ::mr/deliberately-open true}
                                   [:target {:optional true}
                                    [:maybe [:map {:closed false, ::mr/deliberately-open true}
                                             [:dimension {:optional true} ::click-behavior.dimension]]]]]]]]]])

(mr/def ::column-settings.key.ref
  "A `:column_settings` key that wraps a legacy MBQL reference in `ref`."
  [:tuple {:decode/normalize vec}
   [:= {:decode/normalize keyword} :ref]
   ::legacy-reference])

(mr/def ::column-settings.key.name
  "A `:column_settings` key that wraps the name of a column in `name`."
  [:tuple {:decode/normalize vec}
   [:= {:decode/normalize keyword} :name]
   :string])

(mr/def ::column-settings.key
  "A `:column_settings` key, decoded from its JSON: a legacy MBQL reference wrapped in `ref`, a column name wrapped in
  `name`, or a bare legacy MBQL reference."
  [:or ::column-settings.key.ref ::column-settings.key.name ::legacy-reference])

#?(:clj
   (def ^:private normalize-column-key
     "The `:column_settings` key `k`, the JSON-encoded reference or name of a column, with its legacy MBQL reference
     normalized; nil for one that isn't valid."
     (u.memo/fast-bounded
      (fn [k]
        (let [decoded (json/decode k)]
          (some-> (if (sequential? decoded)
                    (let [decode     (mr/cached ::column-settings.key-decoder ::column-settings.key
                                                #(mc/decoder ::column-settings.key (mtx/transformer {:name :normalize})))
                          normalized (decode decoded)]
                      (when (mr/validate ::column-settings.key normalized)
                        normalized))
                    decoded)
                  json/encode)))
      :bounded/threshold 4096)))

(defn- normalize-column-settings
  "The `column-settings` with their keys normalized, without those that aren't valid."
  [column-settings]
  (if (map? column-settings)
    (into {}
          (keep (fn [[k v]]
                  (when-let [k #?(:clj  (some-> k lib.schema.common/normalize-string-key normalize-column-key)
                                  :cljs (lib.schema.common/normalize-string-key k))]
                    [k v])))
          column-settings)
    column-settings))

(defn- keywordize-settings
  "The `settings` with keyword keys all the way down, as their column reads them back, but for the keys of
  `:column_settings`."
  [settings]
  (if (map? settings)
    (let [settings (update-keys settings #(cond-> % (string? %) keyword))]
      (cond-> (keywordize-keys (dissoc settings :column_settings))
        (some? (:column_settings settings)) (assoc :column_settings (:column_settings settings))))
    settings))

(mr/def ::column-settings
  "The `:column_settings` of a visualization: the settings of each column, by its JSON-encoded reference or name, with
  keyword keys all the way down."
  [:map-of {:decode/normalize normalize-column-settings}
   :string
   [:maybe [:map {:closed false, ::mr/deliberately-open true, :description "column settings"
                  :decode/normalize keywordize-keys}
            [:click_behavior {:optional true} [:maybe ::click-behavior]]]]])

(defn- normalize-table-column
  "The table `column` with the legacy MBQL reference older settings give it under `:fieldRef`, the key the other
  spellings mean, and without the unused `:key` they had."
  [column]
  (if (map? column)
    (let [field-ref (or (:fieldRef column) (:field_ref column) (:fieldref column))]
      (cond-> (dissoc column :key :field_ref :fieldref)
        (some? field-ref) (assoc :fieldRef field-ref)))
    column))

(mr/def ::table.columns
  "The `:table.columns` of a table visualization: its columns in display order, with the legacy MBQL reference older
  settings give each under `:fieldRef`."
  [:sequential
   [:maybe [:map {:closed false, ::mr/deliberately-open true, :description "table column"
                  :decode/normalize normalize-table-column}
            [:fieldRef {:optional true} [:maybe ::column-name-or-ref]]]]])

(mr/def ::table.column-formatting
  "The `:table.column_formatting` of a table visualization: its conditional formatting rules, each with the columns it
  applies to."
  [:sequential
   [:maybe [:map {:closed false, ::mr/deliberately-open true, :description "column formatting rule"}
            [:columns {:optional true} [:maybe [:sequential [:maybe ::column-name-or-ref]]]]]]])

(mr/def ::pivot-table.column-split
  "The `:pivot_table.column_split` of a pivot table: the columns it pivots into rows, columns and values."
  [:map {:closed false, ::mr/deliberately-open true, :description "pivot table column split"}
   [:rows    {:optional true} [:maybe [:sequential [:maybe ::column-name-or-ref]]]]
   [:columns {:optional true} [:maybe [:sequential [:maybe ::column-name-or-ref]]]]
   [:values  {:optional true} [:maybe [:sequential [:maybe ::column-name-or-ref]]]]])

(mr/def ::pivot-table.collapsed-rows
  "The `:pivot_table.collapsed_rows` of a pivot table: the row columns and the values whose rows are collapsed."
  [:map {:closed false, ::mr/deliberately-open true, :description "pivot table collapsed rows"}
   [:rows {:optional true} [:maybe [:sequential [:maybe ::column-name-or-ref]]]]])

(mr/def ::visualization-settings
  "Chart-rendering settings authored by the frontend, as their column stores them. The backend reads no fixed key set
  but these, so the keys are whatever the visualization the user picked needs."
  [:map {:closed false, ::mr/deliberately-open true, :decode/normalize keywordize-settings
         :description #?(:clj (i18n/deferred-tru "Value must be a map.") :cljs "visualization settings")
         #?@(:clj [:error/fn (constantly (i18n/deferred-tru "Value must be a map."))])}
   [:column_settings            {:optional true} [:maybe ::column-settings]]
   [:click_behavior             {:optional true} [:maybe ::click-behavior]]
   [:table.columns              {:optional true} [:maybe ::table.columns]]
   [:table.column_formatting    {:optional true} [:maybe ::table.column-formatting]]
   [:pivot_table.column_split   {:optional true} [:maybe ::pivot-table.column-split]]
   [:pivot_table.collapsed_rows {:optional true} [:maybe ::pivot-table.collapsed-rows]]])
