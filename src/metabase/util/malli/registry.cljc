(ns metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [clojure.test.check.generators :as gen]
   [malli.core :as mc]
   [malli.generator :as mg]
   [malli.impl.regex :as re]
   [malli.registry :as mr]
   [malli.util :as mut])
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

;;; Implementation of :vcatn schema: stolen from malli sources,
;;; would be nice to find a more composable way.
(defn- schemas []
  (let [-re-min-max @#'mc/-re-min-max]
    {:vcatn (mc/-sequence-entry-schema
             {:type :vcatn, :child-bounds {}
              :re-validator (fn [_ children] (apply re/cat-validator children))
              :re-explainer (fn [_ children] (apply re/cat-explainer children))
              :re-parser (fn [_ children] (apply re/catn-parser children))
              :re-unparser (fn [_ children] (apply re/catn-unparser children))
              :re-transformer (fn [_ children] (apply re/cat-transformer children))
              :re-min-max (fn [_ children] (reduce (partial -re-min-max +)
                                                  {:min 0, :max 0}
                                                  (mc/-vmap last children)))})}))

(defn- -vcat-gen [schema options]
  (let [gs (->> (mc/children schema options)
                (map #(mg/-regex-generator (#'mg/entry->schema %) options)))]
    (if (some mg/-unreachable-gen? gs)
      (mg/-never-gen options)
      (->> gs
           (apply gen/tuple)
           ;; generate vectors instead of lazy sequences
           (gen/fmap #(into [] cat %))))))

(defmethod mg/-schema-generator :vcatn
  [schema options]
  (-vcat-gen schema options))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas) (mut/schemas) (schemas))))

(defonce ^:private registry (mr/mutable-registry registry*))

(mr/set-default-registry! registry)

(defn register!
  "Register a spec with our Malli spec "
  [type schema]
  (swap! registry* assoc type schema)
  nil)

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     [type schema]
     `(register! ~type ~schema)))
