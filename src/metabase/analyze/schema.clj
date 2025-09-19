(ns metabase.analyze.schema
  "Schemas used by the analyze code."
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::Table
  [:and
   (ms/InstanceOf :model/Table)
   [:ref ::ms/snake_case_map]])

;; TODO: fix memory issues with `mu/defn` and `ms/InstanceOf` so we don't need to do this
(def Table
  "Schema for a valid instance of a Metabase Table. Using this with `mu/defn` uses less memory than using `(ms/InstanceOf :model/Table)`"
  [:ref ::Table])

;; TODO (Cam 6/26/25) -- this is duplicated with
;; `:metabase.query-processor.middleware.annotate/qp-results-cased-col` but I didn't use that to avoid circular
;; references between modules. Deduplicate these
(mr/def ::qp-results-cased-map
  [:fn
   {:error/message "Map where all simple keywords are snake_case; namespaced keywords can be any case."}
   (fn [m]
     (and (map? m)
          (every? (fn [k]
                    (or (qualified-keyword? k)
                        (not (str/includes? (name k) "-"))))
                  (keys m))))])

(mr/def ::Field
  [:and
   (ms/InstanceOf :model/Field)
   ::qp-results-cased-map])

(def Field
  "Schema for a valid instance of a Metabase Field. Using this with `mu/defn` uses less memory than using `(ms/InstanceOf :model/Field)`"
  [:ref ::Field])
