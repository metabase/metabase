(ns metabase.query-processor.middleware.deduplicate-expression-names
  "QP preprocessing middleware that ensures all expressions that have names that conflict with other columns (or one
  another) are deduplicated."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(defn- update-expression-name [original-name expression-original-name->new-name]
  (get expression-original-name->new-name original-name original-name))

(defn- update-expression-refs [stage expression-original-name->new-name]
  (merge
   (lib.util.match/replace (dissoc stage :joins :lib/stage-metadata)
     [:expression opts (field-name :guard (every-pred
                                           string?
                                           #(contains? expression-original-name->new-name %)))]
     [:expression opts (update-expression-name field-name expression-original-name->new-name)])
   (select-keys stage [:joins :lib/stage-metadata])))

(mu/defn ^:private rename-expressions :- ::lib.schema/stage
  [stage                              :- ::lib.schema/stage
   expression-original-name->new-name :- [:map-of :string :string]]
  (letfn [(update-expression-opts [opts]
            (update opts :lib/expression-name update-expression-name expression-original-name->new-name))
          (update-expression [expression]
            (lib.options/update-options expression update-expression-opts))
          (update-expressions [expressions]
            (mapv update-expression expressions))]
    (-> stage
        (update :expressions update-expressions)
        (update-expression-refs expression-original-name->new-name)
        (update ::renamed merge expression-original-name->new-name))))

(mu/defn ^:private update-refs-for-expressions-renamed-in-previous-stage :- [:maybe ::lib.schema/stage]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (when-let [previous-stage-path (when (pos-int? (last path))
                                   (conj (vec (butlast path)) (dec (last path))))]
    (when-let [renamed (not-empty (::renamed (get-in query previous-stage-path)))]
      (merge
       (lib.util.match/replace (dissoc stage :joins :lib/stage-metadata)
         [:field opts (field-name :guard (every-pred
                                          string?
                                          #(contains? renamed %)))]
         [:field opts (update-expression-name field-name renamed)])
       {::renamed (merge renamed (::renamed stage))}
       (select-keys stage [:joins :lib/stage-metadat])))))

(mu/defn ^:private deduplicate-expression-names-in-stage :- [:maybe ::lib.schema/stage]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (when (seq (:expressions stage))
    (let [visible-columns                             (lib.walk/apply-f-for-stage-at-path lib/visible-columns query path)
          expression-original-name->deduplicated-name (into {}
                                                            (keep (fn [col]
                                                                    (when (= (:lib/source col) :source/expressions)
                                                                      (let [original-name     (:name col)
                                                                            deduplicated-name (:lib/desired-column-alias col)]
                                                                        (when-not (= original-name deduplicated-name)
                                                                          [original-name deduplicated-name])))))
                                                            visible-columns)]
      (cond-> stage
        (seq expression-original-name->deduplicated-name)
        (rename-expressions expression-original-name->deduplicated-name)))))

(mu/defn deduplicate-expression-names :- ::lib.schema/query
  "Rename any expressions whose names conflict with the 'normal' columns in the query."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query (fn [query path stage]
                                (as-> stage stage
                                  (or (update-refs-for-expressions-renamed-in-previous-stage query path stage)
                                      stage)
                                  (or (deduplicate-expression-names-in-stage query path stage)
                                      stage)))))
