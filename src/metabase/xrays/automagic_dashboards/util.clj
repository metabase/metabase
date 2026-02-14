(ns metabase.xrays.automagic-dashboards.util
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(mu/defn field-isa?
  "`isa?` on a field, checking semantic_type and then base_type"
  [{:keys [base_type semantic_type]} :- ::ads/field
   ;; for some insane reason this is called with totally imaginary types like `:type/GenericNumber`
   t :- [:and
         qualified-keyword?
         [:fn
          {:error/message "should be a keyword starting with :type/ or :entity/ (not necessarily an actual metabase.types.core type)"}
          #(#{"type" "entity"} (namespace %))]]]
  (or (isa? (keyword semantic_type) t)
      (isa? (keyword base_type) t)))

(mu/defn key-col?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base_type semantic_type name]} :- ::ads/field]
  (and (isa? base_type :type/Number)
       (or (#{:type/PK :type/FK} semantic_type)
           (let [name (u/lower-case-en name)]
             (or (= name "id")
                 (str/starts-with? name "id_")
                 (str/ends-with? name "_id"))))))

(mu/defn filter-tables :- [:sequential ::ads/source]
  "filter `tables` by `tablespec`, which is just an entity type (eg. :entity/GenericTable)"
  [tablespec tables :- [:maybe [:sequential ::ads/source]]]
  (filter #(-> % :entity_type (isa? tablespec)) tables))

(defn saved-metric?
  "Is this a saved aggregation clause? True for V2 Metrics and Measures."
  [metric]
  (or (lib/clause-of-type? metric :metric)
      (lib/clause-of-type? metric :measure)))

(def ^{:arglists '([metric])} adhoc-metric?
  "Is this an adhoc metric?"
  (complement saved-metric?))

(def ^{:arglists '([x])} encode-base64-json
  "Encode given object as form-encoded base-64-encoded JSON."
  (comp codec/form-encode codec/base64-encode codecs/str->bytes json/encode))

(mu/defn field-reference->id :- [:maybe [:or ms/NonBlankString ::lib.schema.id/field]]
  "Extract field ID from a given field reference form."
  [clause :- :mbql.clause/field]
  (lib.util.match/match-lite clause [:field _opts id] id))

(mu/defn collect-field-references :- [:maybe [:sequential :mbql.clause/field]]
  "Collect all `:field` references from a given form."
  [form]
  (lib.util.match/match form :field &match))

(mu/defn ->field :- [:maybe [:and
                             (ms/InstanceOf :model/Field)
                             ::ads/field]]
  "Return `Field` instance for a given ID or name in the context of root."
  [{{result-metadata :result_metadata} :source, :as root} :- ::ads/root
   field-id-or-name-or-clause                             :- [:or
                                                              ::lib.schema.id/field
                                                              ms/NonBlankString
                                                              :mbql.clause/field
                                                              :mbql.clause/expression]]
  (let [id-or-name (if (sequential? field-id-or-name-or-clause)
                     (field-reference->id field-id-or-name-or-clause)
                     field-id-or-name-or-clause)]
    (or
     ;; Handle integer Field IDs.
     (when (integer? id-or-name)
       (t2/select-one :model/Field :id id-or-name))
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
             (analyze/run-classifiers {}))))
     ;; otherwise this isn't returning something, and that's probably an error. Log it.
     (log/warnf "Cannot resolve Field %s in automagic analysis context\n%s" field-id-or-name-or-clause (u/pprint-to-str root)))))

(defn filter-id-for-field
  "Generate a parameter ID for the given field. In X-ray dashboards a parameter is mapped to a single field only."
  [field]
  (-> field ((juxt :id :name :unit)) hash str))
