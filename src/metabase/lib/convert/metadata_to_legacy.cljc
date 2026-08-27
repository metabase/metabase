(ns metabase.lib.convert.metadata-to-legacy
  (:require
   [medley.core :as m]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as u.memo]))

(let [f (u.memo/fast-memo
         (fn [k]
           (case k
             :metabase.lib.metadata.result-metadata/field-ref :field_ref
             :metabase.lib.metadata.result-metadata/source    :source
             #_else                                           (cond-> k
                                                                (simple-keyword? k) u/->snake_case_en))))]
  (defn lib-metadata-column-key->legacy-metadata-column-key
    "Convert unnamespaced keys to snake case for traditional reasons; `:lib/` keys and the like can stay in kebab case
  because you can't consume them in JS without using bracket notation anyway (and you probably shouldn't be doing it
  in the first place) and it's a waste of CPU cycles to convert them back and forth between snake case and kebab case
  anyway."
    [k]
    (f (keyword k))))

(mu/defn lib-metadata-column->legacy-metadata-column :- :metabase.legacy-mbql.schema/legacy-column-metadata
  "Convert a kebab-case Lib results metadata column to a mixed-case legacy results metadata column:

  * Convert from all-kebab-case keys to legacy casing (simple keywords use snake case while
  namespaced keywords remain in kebab case)

  * Remove `:lib/type`"
  [col :- :map]
  ;; Intentionally using vanilla update-keys here because m.u.perf's implementation would try to assoc snake keys onto
  ;; SnakeHatingMap which results in an exception.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (-> col
      (update-keys lib-metadata-column-key->legacy-metadata-column-key)
      (m/update-existing :binning_info update-keys lib-metadata-column-key->legacy-metadata-column-key)
      (dissoc :lib/type)
      (->> (lib.normalize/normalize :metabase.legacy-mbql.schema/legacy-column-metadata))))
