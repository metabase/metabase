(ns metabase.lib.visualization-settings
  "Lookups into the `:column_settings` of [[metabase.lib.schema.visualization-settings]], whose keys are the
  JSON-encoded reference or name of each column."
  (:require
   #?@(:clj ([metabase.util.json :as json]) :cljs ([metabase.util :as u]))
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as u.memo]
   [metabase.util.performance :as perf]))

(defn- decode-json
  "The value the JSON string `s` encodes, with string map keys, or nil when `s` isn't valid JSON."
  [s]
  (try
    #?(:clj  (json/decode s)
       :cljs (js->clj (js/JSON.parse s)))
    (catch #?(:clj Exception :cljs :default) _
      nil)))

(defn- encode-json
  "The JSON encoding of `x`."
  [x]
  #?(:clj  (json/encode x)
     :cljs (js/JSON.stringify (clj->js x :keyword-fn u/qualified-name))))

(def ^:private parse-column-settings-key*
  "[[parse-column-settings-key]], memoized, since lookups parse every key of `:column_settings` for each value they
  format."
  (u.memo/fast-bounded
   (fn [k]
     (let [[tag x] (let [decoded (decode-json k)]
                     (when (sequential? decoded) decoded))]
       (case tag
         "name" (when (string? x)
                  {:column-name x})
         "ref"  (when (sequential? x)
                  (let [[clause id-or-name options] x]
                    (case clause
                      "field"      (when (pos-int? id-or-name)
                                     {:field-id id-or-name, :field-options (when (map? options) options)})
                      "expression" (when (string? id-or-name)
                                     {:column-name id-or-name})
                      nil)))
         nil)))
   :bounded/threshold 4096))

(defn parse-column-settings-key
  "What the `:column_settings` key `k` refers to: a Field by id, or a column by name, as a `[\"name\" ...]` key or a
  reference to an expression gives it; nil for any other key."
  [k]
  (when (string? k)
    (parse-column-settings-key* k)))

(mu/defn column-name->column-settings-key :- :string
  "The `:column_settings` key of the column named `column-name`."
  [column-name :- :string]
  (encode-json ["name" column-name]))

(mu/defn field-id->column-settings-key :- :string
  "The `:column_settings` key of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (encode-json ["ref" ["field" field-id nil]]))

(mu/defn ref->column-settings-key :- :string
  "The `:column_settings` key of the column `a-ref` refers to, wrapping the legacy reference that settings key it by."
  [a-ref :- ::lib.schema.ref/ref]
  (encode-json ["ref" (lib.convert/->legacy-MBQL a-ref)]))

(defn- column-settings-where
  "The settings of the first column of `viz-settings` whose parsed key satisfies `pred`."
  [viz-settings pred]
  (perf/some (fn [[k settings]]
               (when (some-> (parse-column-settings-key k) pred)
                 settings))
             (:column_settings viz-settings)))

(defn column-settings-for-field-id
  "The settings `viz-settings` give the Field with `field-id`, by a reference to it."
  [viz-settings field-id]
  (when (pos-int? field-id)
    (column-settings-where viz-settings #(= (:field-id %) field-id))))

(defn column-settings-for-name
  "The settings `viz-settings` give the column named `column-name`."
  [viz-settings column-name]
  (when (string? column-name)
    (column-settings-where viz-settings #(= (:column-name %) column-name))))
