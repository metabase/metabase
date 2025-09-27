(ns metabase.xrays.transforms.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [metabase.xrays.transforms.schema :as transforms.schema]))

(defn- add-metadata-to-steps
  [spec]
  (update spec :steps (partial m/map-kv-vals (fn [step-name step]
                                               (assoc step
                                                      :name      (u/qualified-name step-name)
                                                      :transform (:name spec))))))

(defn- transform-spec-coercer []
  (letfn [(transformer []
            (mtx/transformer
             mtx/string-transformer
             mtx/json-transformer
             {:name :normalize}
             {:name :transform-spec}))
          (coercer []
            (mc/coercer
             ::transforms.schema/transform-spec
             (transformer)))]
    (mr/cached ::coercer ::transforms.schema/transform-spec coercer)))

(def ^:private transforms-dir "transforms/")

(defn- transform-specs* []
  (yaml/load-dir transforms-dir (comp (transform-spec-coercer) add-metadata-to-steps)))

(def ^:dynamic ^:private *specs-delay*
  (delay (transform-specs*)))

(mu/defn transform-specs :- [:sequential {:min 1} ::transforms.schema/transform-spec]
  "List of registered dataset transforms."
  []
  @*specs-delay*)
