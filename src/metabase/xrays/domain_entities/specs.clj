(ns metabase.xrays.domain-entities.specs
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [metabase.xrays.domain-entities.schema :as domain-entities.schema]))

(defn- add-to-hierarchy!
  [{domain-entity-name :name, :as spec}]
  (let [spec-type (keyword "DomainEntity" domain-entity-name)]
    (derive spec-type :DomainEntity/*)
    (assoc spec :type spec-type)))

(defn- domain-entity-spec-coercer []
  (letfn [(transformer []
            (mtx/transformer
             mtx/string-transformer
             mtx/json-transformer
             (mtx/key-transformer {:decode u/->kebab-case-en})
             {:name :normalize}
             {:name :domain-entity-spec}))
          (coercer []
            (mc/coercer
             ::domain-entities.schema/domain-entity-spec
             (transformer)
             identity
             (fn raise [{:keys [explain value]}]
               (throw (ex-info "Error normalizing domain entity"
                               {:value value, :error (me/humanize explain)})))))]
    (mr/cached ::coercer ::domain-entities.schema/domain-entity-spec coercer)))

(def ^:private domain-entities-dir "domain_entity_specs/")

(defn- domain-entity-specs* []
  (into {}
        (map (juxt :domain-entity/name identity))
        (yaml/load-dir domain-entities-dir (comp (domain-entity-spec-coercer) add-to-hierarchy!))))

(def ^:private ^:dynamic *specs-delay*
  "Dynamic so we can override this in tests."
  (delay (domain-entity-specs*)))

(mu/defn domain-entity-specs :- [:map-of ::domain-entities.schema/domain-entity.name ::domain-entities.schema/domain-entity-spec]
  "List of registered domain entities."
  []
  @*specs-delay*)
