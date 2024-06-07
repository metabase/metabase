(ns metabase.xrays.automagic-dashboards.util
  (:require
   [buddy.core.codecs :as codecs]
   [cheshire.core :as json]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analyze.classifiers.core :as classifiers]
   [metabase.legacy-mbql.predicates :as mbql.preds]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(defn field-isa?
  "`isa?` on a field, checking semantic_type and then base_type"
  [{:keys [base_type semantic_type]} t]
  (or (isa? (keyword semantic_type) t)
      (isa? (keyword base_type) t)))

(defn key-col?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base_type semantic_type name]}]
  (and (isa? base_type :type/Number)
       (or (#{:type/PK :type/FK} semantic_type)
           (let [name (u/lower-case-en name)]
             (or (= name "id")
                 (str/starts-with? name "id_")
                 (str/ends-with? name "_id"))))))

(defn filter-tables
  "filter `tables` by `tablespec`, which is just an entity type (eg. :entity/GenericTable)"
  [tablespec tables]
  (filter #(-> % :entity_type (isa? tablespec)) tables))

(def ^{:arglists '([metric]) :doc "Is metric a saved metric?"} saved-metric?
  (partial mbql.u/is-clause? :metric))

(def ^{:arglists '([metric]) :doc "Is this a custom expression?"} custom-expression?
  (partial mbql.u/is-clause? :aggregation-options))

(def ^{:arglists '([metric]) :doc "Is this an adhoc metric?"} adhoc-metric?
  (complement (some-fn saved-metric? custom-expression?)))

(def ^{:arglists '([x]) :doc "Base64 encode"} encode-base64-json
  "Encode given object as base-64 encoded JSON."
  (comp codec/base64-encode codecs/str->bytes json/encode))

(mu/defn field-reference->id :- [:maybe [:or ms/NonBlankString ms/PositiveInt]]
  "Extract field ID from a given field reference form."
  [clause]
  (lib.util.match/match-one clause [:field id _] id))

(mu/defn collect-field-references :- [:maybe [:sequential mbql.s/field]]
  "Collect all `:field` references from a given form."
  [form]
  (lib.util.match/match form :field &match))

(mu/defn ->field :- [:maybe (ms/InstanceOf Field)]
  "Return `Field` instance for a given ID or name in the context of root."
  [{{result-metadata :result_metadata} :source, :as root}
   field-id-or-name-or-clause :- [:or ms/PositiveInt ms/NonBlankString [:fn mbql.preds/Field?]]]
  (let [id-or-name (if (sequential? field-id-or-name-or-clause)
                     (field-reference->id field-id-or-name-or-clause)
                     field-id-or-name-or-clause)]
    (or
     ;; Handle integer Field IDs.
     (when (integer? id-or-name)
       (t2/select-one Field :id id-or-name))
     ;; handle field string names. Only if we have result metadata. (Not sure why)
     (when (string? id-or-name)
       (when-not result-metadata
         (log/warn "Warning: Automagic analysis context is missing result metadata. Unable to resolve Fields by name."))
       (when-let [field (m/find-first #(= (:name %) id-or-name)
                                      result-metadata)]
         (as-> field field
           (update field :base_type keyword)
           (update field :semantic_type keyword)
           (mi/instance Field field)
           (classifiers/run-classifiers field {}))))
     ;; otherwise this isn't returning something, and that's probably an error. Log it.
     (log/warnf "Cannot resolve Field %s in automagic analysis context\n%s" field-id-or-name-or-clause (u/pprint-to-str root)))))
