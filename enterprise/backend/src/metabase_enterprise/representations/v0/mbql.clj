(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations.
   Uses namespaced keywords with :ref/ prefix to avoid collisions with real MBQL queries."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   [java.util Base64]))

(set! *warn-on-reflection* true)

;; ============================================================================
;; Base64 Encoding/Decoding for MBQL Data
;; ============================================================================

(defn encode-mbql-data
  "Encode MBQL data structure as base64.
   Takes a map with :query and optionally :result_metadata,
   converts to YAML string, then base64 encodes."
  [data]
  (let [^String yaml-str (yaml/generate-string data)
        bytes (.getBytes yaml-str "UTF-8")
        encoder (Base64/getEncoder)]
    (.encodeToString encoder bytes)))

(defn decode-mbql-data
  "Decode base64 MBQL data back to structure.
   Takes a base64 string, decodes to YAML, parses back to map."
  [^String base64-str]
  (let [decoder (Base64/getDecoder)
        bytes (.decode decoder base64-str)
        yaml-str (String. bytes "UTF-8")]
    (yaml/parse-string yaml-str)))

;; ============================================================================
;; MBQL Data Schema
;; ============================================================================

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'v0/mbql-data'"}
   :v0/mbql-data])

(mr/def ::ref
  [:and
   {:description "Reference identifier for the MBQL data"}
   ::lib.schema.common/non-blank-string])

(mr/def ::data
  [:and
   {:description "Base64-encoded YAML containing query and optionally result_metadata"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-data
  [:map
   {:description "v0 schema for MBQL data representation"}
   [:type ::type]
   [:ref ::ref]
   [:data ::data]])

(defmethod import/type->schema :v0/mbql-data [_]
  ::mbql-data)

;; ============================================================================
;; Import: Convert representation refs to Metabase IDs
;; ============================================================================

(defn resolve-source-table
  "Resolves refs in the raw MBQL map, replacing them with IDs for import."
  [mbql-query ref-index]
  (let [table-ref (:source-table mbql-query)
        table-id (cond
                   ;; ref to another card/question:
                   (v0-common/ref? table-ref)
                   (->> (v0-common/ref->id table-ref ref-index)
                        (str "card__"))
                   ;; map with database ref - resolve database and lookup table
                   (and (map? table-ref) (v0-common/ref? (:ref/database table-ref)))
                   (let [db-id (v0-common/ref->id (:ref/database table-ref) ref-index)

                         table-id
                         (t2/select-one-fn :id :model/Table
                                           :db_id db-id
                                           :schema (:ref/schema table-ref)
                                           :name (:ref/table table-ref))]
                     (when (nil? table-id)
                       (throw (ex-info "Could not find matching table."
                                       {:table-ref table-ref})))
                     table-id)
                   ;; Not a ref -- leave it be
                   :else
                   table-ref)]
    (assoc mbql-query :source-table table-id)))

(defn resolve-fields
  "Resolves field refs in MBQL, converting maps to [:field id] vectors for import."
  [mbql-query ref-index]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (:ref/field node) (:ref/table node))
       ;; It's a field map - resolve it to [:field id]
       (let [db-id (v0-common/ref->id (:ref/database node) ref-index)
             table-id (t2/select-one-fn :id :model/Table
                                        :db_id db-id
                                        :schema (:ref/schema node)
                                        :name (:ref/table node))
             field-id (t2/select-one-fn :id :model/Field
                                        :table_id table-id
                                        :name (:ref/field node))]
         [:field field-id])
       node))
   mbql-query))

;; ============================================================================
;; Export: Convert Metabase IDs to representation refs
;; ============================================================================

(defn- table-ref
  "Convert a table ID to a representation ref map."
  [table-id]
  (when-some [t (t2/select-one :model/Table table-id)]
    (-> {:ref/database (v0-common/->ref (:db_id t) :database)
         :ref/schema (:schema t)
         :ref/table (:name t)}
        u/remove-nils)))

(defn- card-ref
  "Convert a card reference string (e.g. 'card__123') to a representation ref."
  [s]
  (let [[_type id] (str/split s #"__")
        id (Long/parseLong id)
        rep (export/export-entity (t2/select-one :model/Card :id id))]
    (str "ref:" (:ref rep))))

(defn ->ref-source-table
  "Convert source_table from IDs to representation refs for export."
  [query]
  (if-some [st (-> query :query :source-table)]
    (cond
      (string? st)
      (assoc-in query [:query :source-table]
                (card-ref st))

      (number? st)
      (assoc-in query [:query :source-table]
                (table-ref st))

      :else
      (throw (ex-info "Unknown source table type" {:query query
                                                   :source-table st})))
    query))

(defn ->ref-database
  "Convert database from ID to representation ref for export."
  [query]
  (if-some [db (:database query)]
    (assoc query :database (v0-common/->ref db :database))
    query))

(defn ->ref-fields
  "Convert fields from [:field id] vectors to representation ref maps for export."
  [query]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (or (= :field (first node))
                  (= "field" (first node))))
       (let [[_ id] node]
         (cond
           (string? id)
           node

           (number? id)
           (let [field (t2/select-one :model/Field id)
                 tr (table-ref (:table_id field))]
             (assoc tr :ref/field (:name field)))

           :else
           node))
       node))
   query))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure.
   Handles both embedded MBQL (map) and MBQL refs (string)."
  [{:keys [query mbql_query database] :as representation} ref-index]
  (let [database-id (v0-common/ref->id database ref-index)]
    (cond
      ;; Native SQL query - simple case
      query
      {:type :native
       :native {:query query}
       :database database-id}

      ;; MBQL query - check if it's a ref or embedded map
      mbql_query
      (let [mbql-data (if (string? mbql_query)
                        ;; It's a ref - look up in ref-index
                        (if (v0-common/ref? mbql_query)
                          (get ref-index (v0-common/unref mbql_query))
                          ;; Not a ref, might be direct string - shouldn't happen
                          (throw (ex-info "mbql_query string must be a ref"
                                          {:mbql_query mbql_query})))
                        ;; It's an embedded map - use directly
                        mbql_query)
            ;; Extract query from MBQL data (for refs) or use directly (for maps)
            mbql-query-map (if (map? mbql-data)
                             (if (:query mbql-data)
                               (:query mbql-data) ;; From decoded MBQL data
                               mbql-data) ;; Direct embedded map
                             (throw (ex-info "Invalid MBQL data structure"
                                             {:mbql-data mbql-data})))
            resolved-mbql (-> (resolve-source-table mbql-query-map ref-index)
                              (resolve-fields ref-index))]
        {:type :query
         :database database-id
         :query resolved-mbql})

      ;; sanity check
      :else
      (throw (ex-info "Question must have either 'query' or 'mbql_query'"
                      {:representation representation})))))

;; ============================================================================
;; MBQL Data Export/Import
;; ============================================================================

(defn create-mbql-data
  "Create an MBQL data representation from query and optional result_metadata.
   Returns a map with plain data - encoding happens only when writing to YAML."
  [mbql-ref query result-metadata]
  (u/remove-nils {:type :v0/mbql-data
                  :ref mbql-ref
                  :query query
                  :result_metadata result-metadata}))

(defmethod export/export-entity :v0/mbql-data [mbql-data-rep]
  (-> mbql-data-rep
      (assoc :data (encode-mbql-data (select-keys mbql-data-rep [:query :result_metadata])))
      (dissoc :query :result_metadata)))

(defmethod import/decode-data :v0/mbql-data
  [representation]
  (update representation :data decode-mbql-data))

(defmethod import/yaml->toucan :v0/mbql-data
  [representation _ref-index]
  (:data representation))

(defmethod import/persist! :v0/mbql-data
  [representation _ref-index]
  (import/yaml->toucan representation nil))
