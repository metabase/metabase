(ns metabase.domain-entities.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.util.malli :as mu]
   [metabase.util.yaml :as yaml]))

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [k v]
                           (assoc v :name k))))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  [:fn {:decode/spec-transformer mbql.normalize/normalize} mbql.u/mbql-clause?])

(def FieldType
  "Field type designator -- a keyword derived from `type/*`"
  [:and {:decode/spec-transformer (partial keyword "type")} :keyword])

(def ^:private DomainEntityReference :string)

(def ^:private DomainEntityType [:fn #(isa? % :DomainEntity/*)])

(def ^:private Identifier :string)

(def ^:private Description :string)

(def ^:private Attributes [:sequential
                           [:map {:closed true}
                            [:field         {:optional true} FieldType]
                            [:domain_entity {:optional true} DomainEntityReference]
                            [:has_many      {:optional true} [:map {:closed true}
                                                              [:domain_entity DomainEntityReference]]]]])

(def ^:private BreakoutDimensions
  [:sequential {:decode/spec-transformer (fn [breakout-dimensions]
                                             (for [dimension breakout-dimensions]
                                               (if (string? dimension)
                                                 (do
                                                  (mu/validate-throw FieldType (keyword "type" dimension))
                                                  [:dimension dimension])
                                                 dimension)))}
   MBQL])


(def ^:private Metrics [:map-of
                        {:decode/spec-transformer add-name-from-key}
                        Identifier
                        [:map {:closed true}
                         [:aggregation                  MBQL]
                         [:name                         Identifier]
                         [:breakout    {:optional true} BreakoutDimensions]
                         [:filter      {:optional true} MBQL]
                         [:description {:optional true} Description]]])

(def ^:private Segments [:map-of
                         {:decode/spec-transformer add-name-from-key}
                         Identifier
                         [:map {:closed true}
                          [:name                         Identifier]
                          [:filter                       MBQL]
                          [:description {:optional true} Description]]])

(def DomainEntitySpec
  "Domain entity spec"
  [:map {:closed true}
   [:name                                 DomainEntityReference]
   [:type                                 DomainEntityType]
   [:required_attributes                  Attributes]
   [:optional_attributes {:optional true} Attributes]
   [:description         {:optional true} Description]
   [:metrics             {:optional true} Metrics]
   [:segments            {:optional true} Segments]
   [:breakout_dimensions {:optional true} BreakoutDimensions]])

(defn- add-to-hiearchy!
  [{:keys [name refines] :as spec}]
  (let [spec-type (keyword "DomainEntity" name)
        refines   (some->> refines (keyword "DomainEntity"))]
    (derive spec-type (or refines :DomainEntity/*))
    (-> spec
        (dissoc :refines)
        (assoc :type spec-type))))

(def ^:private domain-entity-spec-parser
  (mc/coercer
   DomainEntitySpec
   (mtx/transformer {:name :spec-transformer
                     :decoders {:string name}})))

(def ^:private domain-entities-dir "domain_entity_specs/")

(def domain-entity-specs
  "List of registered domain entities."
  (delay (into {} (for [spec (yaml/load-dir domain-entities-dir (comp domain-entity-spec-parser
                                                                      add-to-hiearchy!))]
                    [(:name spec) spec]))))
