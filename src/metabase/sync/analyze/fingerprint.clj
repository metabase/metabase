(ns metabase.sync.analyze.fingerprint
  "Analysis sub-step that takes a sample of values for a Field and saving a non-identifying fingerprint
   used for classification. This fingerprint is saved as a column on the Field it belongs to."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [honeysql.helpers :as h]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze.fingerprint
             [datetime :as datetime]
             [global :as global]
             [number :as number]
             [sample :as sample]
             [text :as text]]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldOrColumn
  {:base_type s/Keyword
   s/Any      s/Any})

(s/defn ^:private type-specific-fingerprint :- (s/maybe i/TypeSpecificFingerprint)
  "Return type-specific fingerprint info for FIELD AND. a FieldSample of Values if it has an elligible base type"
  [field :- FieldOrColumn, values :- i/FieldSample]
  (condp #(isa? %2 %1) (:base_type field)
    :type/Text     {:type/Text (text/text-fingerprint values)}
    :type/Number   {:type/Number (number/number-fingerprint values)}
    :type/DateTime {:type/DateTime (datetime/datetime-fingerprint values)}
    nil))

(s/defn fingerprint :- i/Fingerprint
  "Generate a 'fingerprint' from a FieldSample of VALUES."
  [field :- FieldOrColumn, values :- i/FieldSample]
  (merge
   (when-let [global-fingerprint (global/global-fingerprint values)]
     {:global global-fingerprint})
   (when-let [type-specific-fingerprint (type-specific-fingerprint field values)]
     {:type type-specific-fingerprint})))


(s/defn ^:private save-fingerprint!
  [field :- i/FieldInstance, fingerprint :- i/Fingerprint]
  ;; don't bother saving fingerprint if it's completely empty
  (when (seq fingerprint)
    (log/debug (format "Saving fingerprint for %s" (sync-util/name-for-logging field)))
    ;; All Fields who get new fingerprints should get marked as having the latest fingerprint version, but we'll
    ;; clear their values for `last_analyzed`. This way we know these fields haven't "completed" analysis for the
    ;; latest fingerprints.
    (db/update! Field (u/get-id field)
      :fingerprint         fingerprint
      :fingerprint_version i/latest-fingerprint-version
      :last_analyzed       nil)))

(defn- empty-stats-map [fields-count]
  {:no-data-fingerprints   0
   :failed-fingerprints    0
   :updated-fingerprints   0
   :fingerprints-attempted fields-count})

(s/defn ^:private fingerprint-table!
  [table :- i/TableInstance, fields :- [i/FieldInstance]]
  (let [fields-to-sample (sample/sample-fields table fields)]
    (reduce (fn [count-info [field sample]]
              (if-not sample
                (update count-info :no-data-fingerprints inc)
                (let [result (sync-util/with-error-handling (format "Error generating fingerprint for %s"
                                                                    (sync-util/name-for-logging field))
                               (save-fingerprint! field (fingerprint field sample)))]
                  (if (instance? Exception result)
                    (update count-info :failed-fingerprints inc)
                    (update count-info :updated-fingerprints inc)))))
            (empty-stats-map (count fields-to-sample))
            fields-to-sample)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    WHICH FIELDS NEED UPDATED FINGERPRINTS?                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Logic for building the somewhat-complicated query we use to determine which Fields need new Fingerprints
;;
;; This ends up giving us a SQL query that looks something like:
;;
;; SELECT *
;; FROM metabase_field
;; WHERE active = true
;;   AND preview_display = true
;;   AND visibility_type <> 'retired'
;;   AND table_id = 1
;;   AND ((fingerprint_version < 1 AND
;;         base_type IN ("type/Longitude", "type/Latitude", "type/Integer"))
;;        OR
;;        (fingerprint_version < 2 AND
;;         base_type IN ("type/Text", "type/SerializedJSON")))

(s/defn ^:private base-types->descendants :- #{su/FieldTypeKeywordOrString}
  "Given a set of BASE-TYPES return an expanded set that includes those base types as well as all of their
   descendants. These types are converted to strings so HoneySQL doesn't confuse them for columns."
  [base-types :- #{su/FieldType}]
  (->> (for [base-type base-types]
         (cons base-type (descendants base-type)))
       (reduce set/union)
       (map u/keyword->qualified-name)
       set))

;; It's even cooler if we could generate efficient SQL that looks at what types have already
;; been marked for upgrade so we don't need to generate overly-complicated queries.
;;
;; e.g. instead of doing:
;;
;; WHERE ((version < 2 AND base_type IN ("type/Integer", "type/BigInteger", "type/Text")) OR
;;        (version < 1 AND base_type IN ("type/Boolean", "type/Integer", "type/BigInteger")))
;;
;; we could do:
;;
;; WHERE ((version < 2 AND base_type IN ("type/Integer", "type/BigInteger", "type/Text")) OR
;;        (version < 1 AND base_type IN ("type/Boolean")))
;;
;; (In the example above, something that is a `type/Integer` or `type/Text` would get upgraded
;; as long as it's less than version 2; so no need to also check if those types are less than 1, which
;; would always be the case.)
;;
;; This way we can also completely omit adding clauses for versions that have been "eclipsed" by others.
;; This would keep the SQL query from growing boundlessly as new fingerprint versions are added
(s/defn ^:private versions-clauses :- [s/Any]
  []
  ;; keep track of all the base types (including descendants) for each version, starting from most recent
  (let [versions+base-types (reverse (sort-by first (seq i/fingerprint-version->types-that-should-be-re-fingerprinted)))
        already-seen        (atom #{})]
    (for [[version base-types] versions+base-types
          :let  [descendants  (base-types->descendants base-types)
                 not-yet-seen (set/difference descendants @already-seen)]
          ;; if all the descendants of any given version have already been seen, we can skip this clause altogether
          :when (seq not-yet-seen)]
      ;; otherwise record the newly seen types and generate an appropriate clause
      (do
        (swap! already-seen set/union not-yet-seen)
        [:and
         [:< :fingerprint_version version]
         [:in :base_type not-yet-seen]]))))

(s/defn ^:private honeysql-for-fields-that-need-fingerprint-updating :- {:where s/Any}
  "Return appropriate WHERE clause for all the Fields whose Fingerprint needs to be re-calculated."
  ([]
   {:where [:and
            [:= :active true]
            [:not= :visibility_type "retired"]
            (cons :or (versions-clauses))]})

  ([table :- i/TableInstance]
   (h/merge-where (honeysql-for-fields-that-need-fingerprint-updating)
                  [:= :table_id (u/get-id table)])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      FINGERPRINTING ALL FIELDS IN A TABLE                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private fields-to-fingerprint :- (s/maybe [i/FieldInstance])
  "Return a sequences of Fields belonging to TABLE for which we should generate (and save) fingerprints.
   This should include NEW fields that are active and visibile."
  [table :- i/TableInstance]
  (seq (db/select Field
         (honeysql-for-fields-that-need-fingerprint-updating table))))

;; TODO - `fingerprint-fields!` and `fingerprint-table!` should probably have their names switched
(s/defn fingerprint-fields!
  "Generate and save fingerprints for all the Fields in TABLE that have not been previously analyzed."
  [table :- i/TableInstance]
  (if-let [fields (fields-to-fingerprint table)]
    (fingerprint-table! table fields)
    (empty-stats-map 0)))

(s/defn fingerprint-fields-for-db!
  "Invokes `fingerprint-fields!` on every table in `database`"
  [database :- i/DatabaseInstance
   tables :- [i/TableInstance]
   log-progress-fn]
  (du/with-effective-timezone database
    (apply merge-with + (for [table tables
                              :let [result (fingerprint-fields! table)]]
                          (do
                            (log-progress-fn "fingerprint-fields" table)
                            result)))))
