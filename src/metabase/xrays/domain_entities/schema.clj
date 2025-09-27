(ns metabase.xrays.domain-entities.schema
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli.registry :as mr]))

(mr/def ::dimension-type
  [:or
   ::lib.schema.common/base-type
   ::lib.schema.common/semantic-or-relation-type])

(mr/def :xrays/unresolved-dimension
  [:map
   {:closed true}
   [:lib/type             [:= :xrays/unresolved-dimension]]
   [:xrays/dimension-name :string]
   [:options              {:optional true} [:maybe [:ref ::lib.schema.ref/field.options]]]])

(defn- decode-mbql-placeholder [x]
  (walk/postwalk
   (fn [form]
     (if (and (sequential? form)
              (not (map-entry? form))
              ((some-fn keyword? string?) (first form)))
       (let [k (keyword (first form))]
         (if (= k :dimension)
           {:lib/type             :xrays/unresolved-dimension
            :xrays/dimension-name (second form)
            :options              (when (= (count form) 3)
                                    (last form))}
           {:lib/type :lib/external-op
            :operator k
            :args     (vec (rest form))}))
       form))
   x))

(mr/def ::mbql-placeholder
  "Spec for an MBQL clause placeholder (ie. a vector starting with a keyword) e.g.

    [:xrays/sum [:xrays/dimension \"SomeColumn\"]]"
  [:and {:decode/domain-entity-spec decode-mbql-placeholder
         :decode/transform-spec decode-mbql-placeholder}
   [:map
    [:lib/type [:enum :metadata/column :lib/external-op :xrays/unresolved-dimension]]]
   [:multi {:dispatch :lib/type}
    [:metadata/column            [:ref ::lib.schema.metadata/column]]
    [:lib/external-op            [:ref ::lib.schema.common/external-op]]
    [:xrays/unresolved-dimension [:ref :xrays/unresolved-dimension]]]])

(mr/def ::base-type
  "Field type designator -- a keyword derived from `type/*`"
  [:keyword
   (letfn [(decoder [k]
             (keyword "type" (name k)))]
     {:decode/domain-entity-spec decoder
      :decode/transform-spec     decoder})])

(mr/def ::domain-entity.name :string)

(mr/def ::domain-entity.type
  [:and
   :keyword
   [:fn
    {:error/message "Valid DomainEntity"}
    #(isa? % :DomainEntity/*)]])

(mr/def ::name :string)

(mr/def ::description :string)

(mr/def ::attribute
  [:map
   {:decode/domain-entity-spec (fn [m]
                                 (update-keys m #(keyword "domain-entity.attribute" (name %))))
    :closed                    true}
   [:domain-entity.attribute/field ::base-type]])

(mr/def ::attributes
  [:sequential ::attribute])

(mr/def ::breakout-dimensions
  [:sequential
   {:decode/domain-entity-spec (fn [breakout-dimensions]
                                 (for [dimension breakout-dimensions]
                                   (if (string? dimension)
                                     (do
                                       (mc/assert ::base-type (keyword "type" dimension))
                                       [:dimension dimension])
                                     dimension)))}
   ::mbql-placeholder])

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [k v]
                           (assoc v :name k))))

(mr/def ::metrics
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   ::name
   [:map
    {:closed true
     :decode/domain-entity-spec (fn [m]
                                  (update-keys m #(keyword "domain-entity.metric" (name %))))}
    [:domain-entity.metric/aggregation ::mbql-placeholder]
    [:domain-entity.metric/name        ::name]
    [:domain-entity.metric/breakout    {:optional true} ::breakout-dimensions]
    [:domain-entity.metric/filter      {:optional true} ::mbql-placeholder]
    [:domain-entity.metric/description {:optional true} ::description]]])

(mr/def ::segments
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   ::name
   [:map
    {:closed true
     :decode/domain-entity-spec (fn [m]
                                  (update-keys m #(keyword "domain-entity.segment" (name %))))}
    [:domain-entity.segment/filter      ::mbql-placeholder]
    [:domain-entity.segment/name        ::name]
    [:domain-entity.segment/description {:optional true} ::description]]])

(mr/def ::domain-entity-spec
  "Domain entity spec"
  [:map
   {:closed                    true
    :decode/domain-entity-spec (fn [m]
                                 (update-keys m #(keyword "domain-entity" (name %))))}
   [:domain-entity/name                ::domain-entity.name]
   [:domain-entity/type                ::domain-entity.type]
   ;; TODO -- convert all of these keys to kebab-case.
   [:domain-entity/required-attributes {:optional true} ::attributes]
   [:domain-entity/description         {:optional true} [:maybe ::description]]
   [:domain-entity/optional-attributes {:optional true} [:maybe ::attributes]]
   [:domain-entity/metrics             {:optional true} [:maybe ::metrics]]
   [:domain-entity/segments            {:optional true} [:maybe ::segments]]
   [:domain-entity/breakout-dimensions {:optional true} [:maybe ::breakout-dimensions]]])

(mr/def ::dimension-name
  "CamelCase dimension name (often the `X` in `:type/X`)"
  [:re #"[A-Z][A-Za-z0-9\.]+"])

(mr/def ::reified-breakout-dimensions :any)

(defn- has-no-unresolved-dimension-placeholders? [x]
  (let [has-unresolved-dimension-placeholders? (volatile! false)]
    (walk/postwalk
     (fn [form]
       (when (= form :xrays/dimension)
         (vreset! has-unresolved-dimension-placeholders? true))
       form)
     x)
    (not @has-unresolved-dimension-placeholders?)))

(mr/def ::no-unresolved-dimension-placeholders
  [:fn
   {:error/message "Object with no :xrays/dimension clauses"}
   has-no-unresolved-dimension-placeholders?])

(mr/def ::fully-resolved-mbql-placeholder
  [:or
   ::lib.schema.metadata/column
   [:and
    ::mbql-placeholder
    ::no-unresolved-dimension-placeholders]])

(mr/def ::reified-dimensions
  [:map-of ::dimension-name ::fully-resolved-mbql-placeholder])

(mr/def ::reified-metrics :any)

(mr/def ::reified-segments :any)

(mr/def ::reified-domain-entity
  "Domain entity spec"
  [:merge
   ::domain-entity-spec
   [:map
    {:closed true}
    [:domain-entity/breakout-dimensions ::reified-breakout-dimensions]
    [:domain-entity/dimensions          ::reified-dimensions]
    [:domain-entity/metrics             ::reified-metrics]
    [:domain-entity/segments            ::reified-segments]
    [:domain-entity/source-table        ::lib.schema.metadata/table]]])

(mr/def ::table-with-domain-entity
  [:merge
   ::lib.schema.metadata/table
   [:map
    [:xrays/domain-entity [:maybe ::reified-domain-entity]]]])
