(ns metabase.driver.interface
  "Protocols that DB drivers implement. Thus, the interface such drivers provide.")

(set! *warn-on-reflection* true)

;; ## IDriver Protocol

(defprotocol IDriver
  "Methods all drivers must implement."
  ;; Connection
  (can-connect? [this database]
    "Check whether we can connect to DATABASE and perform a simple query.
     (To check whether we can connect to a database given only its details, use `can-connect-with-details?` instead).

       (can-connect? (sel :one Database :id 1))")
  (can-connect-with-details? [this details-map]
    "Check whether we can connect to a database and performa a simple query.
     Returns true if we can, otherwise returns false or throws an Exception.

       (can-connect-with-details? {:engine :postgres, :dbname \"book\", ...})")

  ;; Syncing
  (sync-in-context [this database do-sync-fn]
    "This function is basically around-advice for `sync-database!` and `sync-table!` operations.
     Implementers can setup any context necessary for syncing, then need to call DO-SYNC-FN,
     which takes no args.

       (sync-in-context [_ database do-sync-fn]
         (with-jdbc-metadata [_ database]
           (do-sync-fn)))")
  (active-table-names [this database]
    "Return a set of string names of tables, collections, or equivalent that currently exist in DATABASE.")
  (active-column-names->type [this table]
    "Return a map of string names of active columns (or equivalent) -> `Field` `base_type` for TABLE (or equivalent).")
  (table-pks [this table]
    "Return a set of string names of active Fields that are primary keys for TABLE (or equivalent).")

  ;; Query Processing DEPRECATED!
  (process-query ^:deprecated [this query]
    "Process a native or structured query.
     (Don't use this directly; instead, use `metabase.driver/process-query`,
     which does things like preprocessing before calling the appropriate implementation.)"))


;; ## ISyncDriverTableFKs Protocol (Optional)

(defprotocol ISyncDriverTableFKs
  "Optional protocol to provide FK information for a TABLE.
   If a sync driver implements it, Table FKs will be synced; otherwise, the step will be skipped."
  (table-fks [this table]
    "Return a set of maps containing info about FK columns for TABLE.
     Each map should contain the following keys:

     *  fk-column-name
     *  dest-table-name
     *  dest-column-name"))


;; ## ISyncDriverField Protocols

;; Sync drivers need to implement either ISyncDriverFieldValues or ISyncDriverFieldAvgLength *and* ISyncDriverFieldPercentUrls.
;;
;; ISyncDriverFieldValues is used to provide a generic fallback implementation of the other two that calculate these values by
;; iterating over *every* value of the Field in Clojure-land. Since that's slower, it's preferable to provide implementations
;; of ISyncDriverFieldAvgLength/ISyncDriverFieldPercentUrls when possible. (You can also implement ISyncDriverFieldValues and
;; *one* of the other two; the optimized implementation will be used for that and the fallback implementation for the other)

(defprotocol ISyncDriverFieldValues
  "Optional. Used to implement generic fallback implementations of `ISyncDriverFieldAvgLength` and `ISyncDriverFieldPercentUrls`.
   If a sync driver doesn't implement *either* of those protocols, it must implement this one."
  (field-values-lazy-seq [this field]
    "Return a lazy sequence of all values of Field."))

(defprotocol ISyncDriverFieldAvgLength
  "Optional. If this isn't provided, a fallback implementation that calculates average length in Clojure-land will be used instead.
   If a driver doesn't implement this protocol, it *must* implement `ISyncDriverFieldValues`."
  (field-avg-length [this field]
    "Return the average length of all non-nil values of textual FIELD."))

(defprotocol ISyncDriverFieldPercentUrls
  "Optional. If this isn't provided, a fallback implementation that calculates URL percentage in Clojure-land will be used instead.
   If a driver doesn't implement this protocol, it *must* implement `ISyncDriverFieldValues`."
  (field-percent-urls [this field]
    "Return the percentage of non-nil values of textual FIELD that are valid URLs."))


;; # ---------------------------------------- Query Processor 3.0 Interface ----------------------------------------

;; ## Types + Records

(deftype QPField [^Integer id
                  ^String name
                  ^clojure.lang.Keyword base-type])

(deftype QPValue [value
                  ^clojure.lang.Keyword base-type])


(defprotocol IQueryProcessor
  "Methods that both structured + native query processors should implement."
  (annotate-results [this results]))

;; ## IStructuredQueryProcessor

(defprotocol IStructuredQueryProcessor
  (aggregation:rows          [this])
  (aggregation:rows-count    [this])
  (aggregation:avg           [this ^QPField field])
  (aggregation:field-count   [this ^QPField field])
  (aggregation:distinct      [this ^QPField field])
  (aggregation:stddev        [this ^QPField field])
  (aggregation:sum           [this ^QPField field])
  (aggregation:cum-sum       [this ^QPField field])

  (breakout                  [this fields])

  (fields-clause             [this fields])

  (filter:and                [this subclauses])
  (filter:or                 [this subclauses])
  (filter:simple             [this subclause])

  (filter-subclause:inside   [this & {:keys [^QPField lat-field ^QPField lon-field ^QPValue lat-min ^QPValue lat-max ^QPValue lon-min ^QPValue lon-max]}])
  (filter-subclause:not-null [this ^QPField field])
  (filter-subclause:null     [this ^QPField field])
  (filter-subclause:between  [this ^QPField field ^QPValue min ^QPValue max])
  (filter-subclause:=        [this ^QPField field ^QPValue value])
  (filter-subclause:!=       [this ^QPField field ^QPValue value])
  (filter-subclause:<        [this ^QPField field ^QPValue value])
  (filter-subclause:>        [this ^QPField field ^QPValue value])
  (filter-subclause:<=       [this ^QPField field ^QPValue value])
  (filter-subclause:>=       [this ^QPField field ^QPValue value])

  (limit-clause              [this ^Integer limit])

  (order-by                  [this subclauses])

  (order-by-subclause:asc    [this ^QPField field])
  (order-by-subclause:desc   [this ^QPField field])

  ;; PAGE can just be implemented as limit + offset
  (offset-clause             [this ^Integer offset])

  (eval-structured-query     [this]))


;; ## INativeQueryProcessor

(defprotocol INativeQueryProcessor
  (eval-native-query [this]))


;; ## IQueryProcessorFactory

(defprotocol IQueryProcessorFactory
  "Drivers should *definitely* implement this!"
  (create-native-query-processor     [this, ^Integer database-id, ^String native-query])
  (create-structured-query-processor [this, ^Integer database-id, ^Integer source-table-id, query]))
