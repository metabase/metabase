(ns metabase.transform-testing.expectations
  "The public face of a transform test's expectations: how one is built, and how the runner asks it
  what to run and what the answer means.

  [[expectations]] is the only way to build one."
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.expectations.empty :as expectations.empty]
   [metabase.transform-testing.expectations.equals :as expectations.equals]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [expectations.protocol probes interpret])

(mr/def ::context
  "What compiling an expectation's probes needs. Pure: no connection.

  `:output-columns` are the output temp table's own columns, read once the table exists — every
  type that names a column resolves against them rather than against what the author typed."
  [:map {:closed true}
   [:driver         :keyword]
   [:output-table   :string]
   [:output-columns [:sequential ::transform-testing.schema/result-column]]
   [:replacements   :map]])

(def ^:private types
  "Every expectation type, and everything the front door needs from it: the constructor it owns,
  the schema of what a client sends, and the schema of what a run reports. Its key set is also the
  list of known types, so none of the three can drift from the others."
  {:equals {:build  expectations.equals/build
            :schema ::expectations.equals/expectation
            :result ::expectations.equals/result}
   :empty  {:build  expectations.empty/build
            :schema ::expectations.empty/expectation
            :result ::expectations.empty/result}})

(defn- dispatching-on-type
  "A `:multi` over [[types]] taking each type's branch from `k`."
  [properties k]
  (into [:multi properties]
        (map (fn [[type spec]] [type (get spec k)]))
        types))

;;; Registered under the keys `transform-testing.schema` publishes: `::transform-test` and
;;; `::run-result` reference them there, and that namespace stays a leaf.

(mr/def ::transform-testing.schema/expectation
  "A check on the output of the transform under test."
  (dispatching-on-type {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
                        :dispatch         (comp keyword :type)}
                       :schema))

(mr/def ::transform-testing.schema/expectation-result
  "What one expectation found. Which keys it carries beyond the shared ones is fixed by its `:type`."
  (dispatching-on-type {:dispatch :type} :result))

(defn- check-known-type!
  "Throw unless `type` names an expectation this version knows how to build."
  [normalized raw]
  ;; Ahead of the schema rather than inside it: `::expectation` dispatches on `:type` with no
  ;; default branch, so malli's answer to an unrecognized type is that the whole expectation is
  ;; invalid, and the author gets an explain blob describing every branch it failed to match.
  ;; Naming the type and listing the ones that exist is the answer they can act on.
  (let [type (:type normalized)]
    ;; Two ways this must not fire. Normalizing a non-map yields nothing, so there is no type to
    ;; name. And when an inner branch fails to match — an `equals` with an unrecognized `:format`,
    ;; say — normalization leaves the whole map as strings, so `:type` arrives as `"equals"` rather
    ;; than `:equals`; comparing without keywordizing would blame the type for the format's
    ;; mistake. Both are schema refusals, and the check below is what should speak to them.
    (when (and (map? normalized)
               (some? type)
               (not (contains? types (keyword type))))
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unknown-expectation-type
              (tru "Unknown expectation type {0}. Known types: {1}."
                   (pr-str type) (str/join ", " (sort (map name (keys types)))))
              {:type type :expectation raw})))))

(defn- expectation
  "One expectation record from its wire form: normalize, check the type, check the schema, then hand
  it to the type that owns it."
  [raw]
  (let [normalized (lib/normalize ::transform-testing.schema/expectation raw)]
    (check-known-type! normalized raw)
    (when-not (mr/validate ::transform-testing.schema/expectation normalized)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/invalid-expectation
              (tru "Invalid expectation: {0}"
                   ;; Explain what the author wrote, not what normalization made of it. Normalizing
                   ;; anything that is not a map yields nil, so explaining the normalized value
                   ;; tells someone who wrote a bare string that `nil` is invalid — true, and no
                   ;; help at all in finding the string they actually wrote.
                   (mu/explain ::transform-testing.schema/expectation
                               (if (map? normalized) normalized raw)))
              {:expectation raw})))
    ((get-in types [(:type normalized) :build]) normalized)))

(defn- check-unique-names!
  "Throw when two expectations share a name."
  [records]
  (let [dupes (->> (map :name records) frequencies (keep (fn [[n c]] (when (< 1 c) n))) sort)]
    (when (seq dupes)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/duplicate-expectation-name
              (tru "Expectation names must be unique within a test. Repeated: {0}"
                   (str/join ", " dupes))
              {:duplicate-names (vec dupes)})))))

(defn expectations
  "The expectation records for a test's `:expectations` column, in declared order.

  Normalizes the wire form, checks it against its schema, dispatches to the type that owns it, and
  rejects a duplicate name.

  Throws a typed refusal from [[metabase.transform-testing.errors]] — `unknown-expectation-type`,
  `invalid-expectation` or `duplicate-expectation-name`."
  [raw-expectations]
  (let [records (mapv expectation raw-expectations)]
    (check-unique-names! records)
    records))
