(ns metabase.xrays.automagic-dashboards.util
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(mu/defn field-isa?
  "`isa?` on a field, checking semantic_type and then base_type"
  [{:keys [base-type semantic-type]} :- ::ads/column
   ;; for some insane reason this is called with totally imaginary types like `:type/GenericNumber`
   t :- [:and
         qualified-keyword?
         [:fn
          {:error/message "should be a keyword starting with :type/ or :entity/ (not necessarily an actual metabase.types.core type)"}
          #(#{"type" "entity"} (namespace %))]]]
  (or (isa? (keyword semantic-type) t)
      (isa? (keyword base-type) t)))

(mu/defn key-col?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base-type semantic-type name]} :- ::ads/column]
  (and (isa? base-type :type/Number)
       (or (#{:type/PK :type/FK} semantic-type)
           (let [name (u/lower-case-en name)]
             (or (= name "id")
                 (str/starts-with? name "id_")
                 (str/ends-with? name "_id"))))))

(mu/defn filter-tables :- [:sequential ::ads/source]
  "filter `tables` by `tablespec`, which is just an entity type (eg. :entity/GenericTable)"
  [tablespec tables :- [:maybe [:sequential ::ads/source]]]
  (filter #(-> % :entity_type (isa? tablespec)) tables))

(defn saved-metric?
  "Is metric a saved (V2) metric? (Note that X-Rays do not currently know how to handle Saved V2 Metrics.)"
  [metric]
  (lib/clause-of-type? metric :metric))

(defn custom-expression?
  "Is this a custom expression?"
  [metric]
  (mr/validate ::lib.schema.aggregation/aggregation metric))

(def ^{:arglists '([metric])} adhoc-metric?
  "Is this an adhoc metric?"
  (complement (some-fn saved-metric? custom-expression?)))

(def ^{:arglists '([x])} encode-base64-json
  "Encode given object as form-encoded base-64-encoded JSON."
  (comp codec/form-encode codec/base64-encode codecs/str->bytes json/encode))

(mu/defn field-reference->id :- [:maybe [:or :string ::lib.schema.id/field]]
  "Extract field ID from a given field reference form."
  [clause]
  (lib.util.match/match-one clause [:field _opts id] id))

(mu/defn collect-field-references :- [:maybe [:sequential :mbql.clause/field]]
  "Collect all `:field` references from a given form."
  [form]
  (lib.util.match/match form :field &match))

(mu/defn ->field :- [:maybe ::ads/column]
  "Return `Field` instance for a given ID or name in the context of root."
  [{{result-metadata :result_metadata} :source, :as root} :- ::ads/root
   field-id-or-name-or-clause                             :- [:or
                                                              ::lib.schema.id/field
                                                              :name
                                                              :mbql.clause/field
                                                              :mbql.clause/expression]]
  (let [id-or-name (if (sequential? field-id-or-name-or-clause)
                     (field-reference->id field-id-or-name-or-clause)
                     field-id-or-name-or-clause)]
    (or
     ;; Handle integer Field IDs.
     (when (integer? id-or-name)
       (t2/select-one :metadata/column :id id-or-name))
     ;; handle field string names. Only if we have result metadata. (Not sure why)
     (when (string? id-or-name)
       (when-not result-metadata
         (log/warn "Warning: Automagic analysis context is missing result metadata. Unable to resolve Fields by name."))
       (when-let [field (m/find-first #(= (:name %) id-or-name)
                                      result-metadata)]
         (-> field
             (update :base_type keyword)
             (update :semantic_type keyword)
             (->> (mi/instance :model/Field))
             (assoc :xrays/database-id (:database root))
             (analyze/run-classifiers {})
             (lib-be/instance->metadata :metadata/column))))
     ;; otherwise this isn't returning something, and that's probably an error. Log it.
     (log/warnf "Cannot resolve Field %s in automagic analysis context\n%s" field-id-or-name-or-clause (u/pprint-to-str root)))))

(defn filter-id-for-field
  "Generate a parameter ID for the given field. In X-ray dashboards a parameter is mapped to a single field only."
  [field]
  (-> field ((juxt :id :name :unit)) hash str))
