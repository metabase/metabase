(ns metabase.xrays.domain-entities.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.util.yaml :as yaml]))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  [:fn
   {:decode/domain-entity-spec mbql.normalize/normalize
    :decode/transform-spec     mbql.normalize/normalize
    :error/message             "valid MBQL clause"}
   mbql.u/mbql-clause?])

(def FieldType
  "Field type designator -- a keyword derived from `type/*`"
  [:keyword
   (letfn [(decoder [k]
             (keyword "type" (name k)))]
     {:decode/domain-entity-spec decoder
      :decode/transform-spec     decoder})])

(def ^:private DomainEntityReference :string)

(def ^:private DomainEntityType
  [:and
   :keyword
   [:fn
    {:error/message "Valid DomainEntity"}
    #(isa? % :DomainEntity/*)]])

(def ^:private Identifier :string)

(def ^:private Description :string)

(def ^:private Attributes
  [:sequential
   [:map
    [:field         {:optional true} FieldType]
    [:domain_entity {:optional true} DomainEntityReference]
    [:has_many      {:optional true} [:map
                                      [:domain_entity DomainEntityReference]]]]])

(def ^:private BreakoutDimensions
  [:sequential
   {:decode/domain-entity-spec (fn [breakout-dimensions]
                                 (for [dimension breakout-dimensions]
                                   (if (string? dimension)
                                     (do
                                       (mc/assert FieldType (keyword "type" dimension))
                                       [:dimension dimension])
                                     dimension)))}
   MBQL])

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [k v]
                           (assoc v :name k))))

(def ^:private LegacyMetrics
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   Identifier
   [:map
    [:aggregation MBQL]
    [:name        Identifier]
    [:breakout    {:optional true} BreakoutDimensions]
    [:filter      {:optional true} MBQL]
    [:description {:optional true} Description]]])

(def ^:private Segments
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   Identifier
   [:map
    [:filter MBQL]
    [:name   Identifier]
    [:description {:optional true} Description]]])

(def DomainEntitySpec
  "Domain entity spec"
  [:map
   [:name                DomainEntityReference]
   [:type                DomainEntityType]
   [:required_attributes Attributes]
   [:description         {:optional true} Description]
   [:optional_attributes {:optional true} Attributes]
   [:metrics             {:optional true} LegacyMetrics]
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

(defn- coerce-to-domain-entity-spec [spec]
  (mc/coerce DomainEntitySpec
             spec
             (mtx/transformer
              mtx/string-transformer
              mtx/json-transformer
              (mtx/transformer {:name :domain-entity-spec}))))

(def ^:private domain-entities-dir "domain_entity_specs/")

(def domain-entity-specs
  "List of registered domain entities."
  (delay (into {} (for [spec (yaml/load-dir domain-entities-dir (comp coerce-to-domain-entity-spec
                                                                      add-to-hiearchy!))]
                    [(:name spec) spec]))))
