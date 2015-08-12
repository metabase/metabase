(ns metabase.driver.interface
  "Protocols that DB drivers implement. Thus, the interface such drivers provide."
  (:import (clojure.lang Keyword)))

(def ^:const driver-optional-features
  "A set on optional features (as keywords) that may or may not be supported by individual drivers."
  #{:foreign-keys
    :nested-fields                         ; are nested Fields (i.e., Mongo-style nested keys) supported?
    :set-timezone
    :standard-deviation-aggregations
    :unix-timestamp-special-type-fields})

(def ^:const max-sync-lazy-seq-results
  "The maximum number of values we should return when using `field-values-lazy-seq`.
   This many is probably fine for inferring special types and what-not; we don't want
   to scan millions of values at any rate."
  10000)

;; ## IDriver Protocol

(defprotocol IDriver
  "Methods all drivers must implement.
   They should also include the following properties:

   *  `features` (optional)
      A set containing one or more `driver-optional-features`"

  ;; Connection
  (can-connect? [this database]
    "Check whether we can connect to DATABASE and perform a simple query.
     (To check whether we can connect to a database given only its details, use `can-connect-with-details?` instead).

       (can-connect? driver (sel :one Database :id 1))")
  (can-connect-with-details? [this details-map]
    "Check whether we can connect to a database and performa a simple query.
     Returns true if we can, otherwise returns false or throws an Exception.

       (can-connect-with-details? driver {:engine :postgres, :dbname \"book\", ...})")

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
  (field-values-lazy-seq [this field]
    "Return a lazy sequence of all values of Field.
     This is used to implement `mark-json-field!`, and fallback implentations of `mark-no-preview-display-field!` and `mark-url-field!`
     if drivers *don't* implement `ISyncDriverFieldAvgLength` or `ISyncDriverFieldPercentUrls`, respectively.")

  ;; Query Processing
  (process-query [this query]
    "Process a native or structured query.
     (Don't use this directly; instead, use `metabase.driver/process-query`,
     which does things like preprocessing before calling the appropriate implementation.)")
  (wrap-process-query-middleware [this qp-fn]
    "Custom QP middleware for this driver.
     Like `sync-in-context`, but for running queries rather than syncing. This is basically around-advice for the QP pre and post-processing stages.
     This should be used to do things like open DB connections that need to remain open for the duration of post-processing.
     This middleware is injected into the QP middleware stack immediately after the Query Expander; in other words, it will receive the expanded query.
     See the Mongo driver for and example of how this is intended to be used."))


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


(defprotocol ISyncDriverFieldNestedFields
  "Optional protocol that should provide information about the subfields of a FIELD when applicable.
   Drivers that declare support for `:nested-fields` should implement this protocol."
  (active-nested-field-name->type [this field]
    "Return a map of string names of active child `Fields` of FIELD -> `Field.base_type`."))


;; ## ISyncDriverField Protocols (Optional)

;; These are optional protocol that drivers can implement to be used instead of falling back to field-values-lazy-seq for certain Field
;; syncing operations, which involves iterating over a few thousand values of the Field in Clojure-land. Since that's slower, it's
;; preferable to provide implementations of ISyncDriverFieldAvgLength/ISyncDriverFieldPercentUrls when possible.

(defprotocol ISyncDriverFieldAvgLength
  "Optional. If this isn't provided, a fallback implementation that calculates average length in Clojure-land will be used instead."
  (field-avg-length [this field]
    "Return the average length of all non-nil values of textual FIELD."))

(defprotocol ISyncDriverFieldPercentUrls
  "Optional. If this isn't provided, a fallback implementation that calculates URL percentage in Clojure-land will be used instead."
  (field-percent-urls [this field]
    "Return the percentage of non-nil values of textual FIELD that are valid URLs."))


;;; ## ISyncDriverSpecificSyncField (Optional)

(defprotocol ISyncDriverSpecificSyncField
  "Optional. Do driver-specific syncing for a FIELD."
  (driver-specific-sync-field! [this field]
    "This is a chance for drivers to do custom Field syncing specific to their database.
     For example, the Postgres driver can mark Postgres JSON fields as `special_type = json`.
     As with the other Field syncing functions in `metabase.driver.sync`, this method should return the modified
     FIELD, if any, or `nil`."))


;; ## Helper Functions

(def ^:private valid-feature? (partial contains? driver-optional-features))

(defn supports?
  "Does DRIVER support FEATURE?"
  [{:keys [features]} ^Keyword feature]
  {:pre [(set? features)
         (every? valid-feature? features)
         (valid-feature? feature)]}
  (contains? features feature))

(defn assert-driver-supports
  "Helper fn. Assert that DRIVER supports FEATURE."
  [driver ^Keyword feature]
  (when-not (supports? driver feature)
    (throw (Exception. (format "%s is not supported by this driver." (name feature))))))
