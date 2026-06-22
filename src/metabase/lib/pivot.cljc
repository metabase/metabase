(ns metabase.lib.pivot
  "MBQL 5 native pivot foundation: schema helpers, the synthetic `pivot-grouping` column, the viz-settings transform,
  and related utilities.

  BE-only. Not exported from [[metabase.lib.js]] — the FE never constructs a `:pivot` clause."
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]))

(def pivot-grouping-column-name
  "Name of the synthetic column produced for pivot queries from `GROUPING(...)` in the compiled SQL."
  "pivot-grouping")

;;; TODO: reconcile shapes with the private legacy snake_case map in [[metabase.query-processor.pivot.middleware]] —
;;; both describe the same column at different layers (Lib metadata vs result-metadata).
(def pivot-grouping-column-metadata
  "Lib-shaped column metadata for the synthetic `pivot-grouping` column spliced into a pivot query's returned columns."
  {:lib/type                 :metadata/column
   :name                     pivot-grouping-column-name
   :base-type                :type/Integer
   :lib/source               :source/pivot-grouping
   :lib/source-column-alias  pivot-grouping-column-name
   :lib/desired-column-alias pivot-grouping-column-name})

(mu/defn has-pivot? :- :boolean
  "True if the query carries a `:pivot` clause."
  [query :- ::lib.schema/query]
  (some? (:pivot query)))

(defn read-show-flag
  "Read a `show-*-totals` flag from `m`, trying each of `ks` in order. Defaults to `true` when none present. Treats an
  explicitly-set `false` as set (not as 'absent')."
  [m & ks]
  (reduce (fn [acc k]
            (if (contains? m k)
              (reduced (get m k))
              acc))
          true
          ks))

(defn splice-pivot-grouping
  "Insert [[pivot-grouping-column-metadata]] into `cols` immediately after the leading run of breakout columns. Used to
  extend `returned-columns` when the query carries a `:pivot` clause. Returns a vector."
  [cols]
  (let [[breakouts rest-cols] (split-with :lib/breakout? cols)]
    (-> (vec breakouts)
        (conj pivot-grouping-column-metadata)
        (into rest-cols))))

(defn- resolve-breakout-uuids [query uuids axis]
  (let [by-uuid (into {}
                      (map (juxt lib.options/uuid identity))
                      (:breakout (lib.util/query-stage query -1)))]
    (mapv (fn [breakout-id]
            (or (by-uuid breakout-id)
                (throw (ex-info (str ":pivot " (name axis) " references unknown breakout uuid " (pr-str breakout-id))
                                {:axis axis, :uuid breakout-id, :known-uuids (set (keys by-uuid))}))))
          uuids)))

(mu/defn pivot-rows :- [:maybe [:sequential :any]]
  "Return the breakout clauses corresponding to `:pivot :rows`, in `:rows` order. UUIDs resolve against breakouts of
  the last stage. Throws if any UUID does not resolve."
  [query :- ::lib.schema/query]
  (when-let [rows (-> query :pivot :rows)]
    (resolve-breakout-uuids query rows :rows)))

(mu/defn pivot-columns :- [:maybe [:sequential :any]]
  "Return the breakout clauses corresponding to `:pivot :columns`. See [[pivot-rows]]."
  [query :- ::lib.schema/query]
  (when-let [columns (-> query :pivot :columns)]
    (resolve-breakout-uuids query columns :columns)))
