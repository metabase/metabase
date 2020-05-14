(ns metabase.query-processor.middleware.results-metadata
  "Middleware that stores metadata about results column types after running a query for a Card,
   and returns that metadata (which can be passed *back* to the backend when saving a Card) as well
   as a checksum in the API response."
  (:require [buddy.core.hash :as hash]
            [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.driver :as driver]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.sync.analyze.query-results :as analyze.results]
            [metabase.util
             [encryption :as encryption]
             [i18n :refer [tru]]]
            [ring.util.codec :as codec]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                     Checksum Util Fns (some of these aren't used in the middleware itself)                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- prepare-for-serialization
  "Return version of `node` that will hash consistently"
  [node]
  (cond
    ;; Integers get converted to floats by the frontend and will hash differently. Convert all integers to floats so
    ;; that they hash the same before being sent to the FE and after
    (integer? node)
    (double node)
    ;; Hashmaps are not guaranteed to hash the same values (be stored in the same order) across machines or versions
    ;; of the JDK. Array maps will be automatically converted ot hashmaps once they are large enough. Convert maps to
    ;; sorted maps so that we can get a consistent ordering regardless of map implementation and whether or not the FE
    ;; changes the order of the keys
    (map? node)
    (into (sorted-map) node)
    ;; We probably don't have any sets in our result metadata. If we did, those are hashed and would not have a
    ;; predictable order. Putting this check/conversion in as it's easy to do and we might have sets in the future.
    (set? node)
    (into (sorted-set) node)
    ;; If it's not one of the above, it's a noop
    :else
    node))

(defn- serialize-metadata-for-hashing
  [metadata]
  (->> metadata
       (walk/postwalk prepare-for-serialization)
       json/generate-string))

(defn- metadata-checksum
  "Simple, checksum of the column results `metadata`.
   Results metadata is returned as part of all query results, with the hope that the frontend will pass it back to
   us when a Card is saved or updated. This checksum (also passed) is a simple way for us to check whether the metadata
   is valid and hasn't been accidentally tampered with.

   By default, this is not cryptographically secure, nor is it meant to be. Of course, a bad actor could alter the
   metadata and return a new, correct checksum. But intentionally saving bad metadata would only help in letting you
   write bad queries; the field literals can only refer to columns in the original 'source' query at any rate, so you
   wouldn't, for example, be able to give yourself access to columns in a different table.

   However, if `MB_ENCRYPTION_SECRET_KEY` is set, we'll go ahead and use it to encypt the checksum so it becomes it
   becomes impossible to alter the metadata and produce a correct checksum at any rate."
  [metadata]
  (when metadata
    (-> metadata
        serialize-metadata-for-hashing
        hash/md5
        codec/base64-encode
        encryption/maybe-encrypt)))

(defn valid-checksum?
  "Is the `checksum` the right one for this column `metadata`?"
  [metadata checksum]
  (and metadata
       checksum
       (= (encryption/maybe-decrypt (metadata-checksum metadata) :log-errors? false)
          (encryption/maybe-decrypt checksum                     :log-errors? false))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO -
;;
;; 1. Is there some way we could avoid doing this every single time a Card is ran? Perhaps by passing the current Card
;;    metadata as part of the query context so we can compare for changes
;;
;; 2. Consider whether the actual save operation should be async as with
;;    `metabase.query-processor.middleware.process-userland-query`
(defn- record-metadata! [{{:keys [card-id nested?]} :info} metadata]
  (try
    ;; At the very least we can skip the Extra DB call to update this Card's metadata results
    ;; if its DB doesn't support nested queries in the first place
    (when (and metadata
               driver/*driver*
               (driver/supports? driver/*driver* :nested-queries)
               card-id
               (not nested?))
      (db/update! 'Card card-id :result_metadata metadata))
    ;; if for some reason we weren't able to record results metadata for this query then just proceed as normal
    ;; rather than failing the entire query
    (catch Throwable e
      (log/error e (tru "Error recording results metadata for query")))))

(defn- merge-final-column-metadata
  "Because insights are generated by reducing functions, they start working before the entire query metadata is in its
  final form. Some columns come back without type information, and thus get an initial base type of `:type/*` (unknown
  type); in this case, the `annotate` middleware scans the first few values and infers a base type, adding that
  information to the column metadata in the final result.

  This function merges inferred column base types added by `annotate` into the metadata generated by `insights`."
  [final-col-metadata insights-col-metadata]
  ;; the two metadatas will both be in order that matches the column order of the results
  (mapv
   (fn [{final-base-type :base_type} {our-base-type :base_type, :as insights-col}]
     (merge
      insights-col
      (when (= our-base-type :type/*)
        {:base_type final-base-type})))
   final-col-metadata
   insights-col-metadata))

(defn- insights-xform [orig-metadata record! rf]
  (qp.reducible/combine-additional-reducing-fns
   rf
   [(analyze.results/insights-rf orig-metadata)]
   (fn combine [result {:keys [metadata insights]}]
     (let [metadata (merge-final-column-metadata (-> result :data :cols) metadata)]
       (record! metadata)
       (rf (cond-> result
             (map? result)
             (update :data assoc
                     :results_metadata {:checksum (metadata-checksum metadata)
                                        :columns  metadata}
                     :insights insights)))))))

(defn record-and-return-metadata!
  "Middleware that records metadata about the columns returned when running the query."
  [qp]
  (fn [{{:keys [skip-results-metadata?]} :middleware, :as query} rff context]
    (if skip-results-metadata?
      (qp query rff context)
      (let [record! (partial record-metadata! query)
            rff' (fn [metadata]
                   (insights-xform metadata record! (rff metadata)))]
        (qp query rff' context)))))
