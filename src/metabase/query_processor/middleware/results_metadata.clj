(ns metabase.query-processor.middleware.results-metadata
  "Middleware that stores metadata about results column types after running a query for a Card,
   and returns that metadata (which can be passed *back* to the backend when saving a Card) as well
   as a checksum in the API response."
  (:require [buddy.core.hash :as hash]
            [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [metabase.models.humanization :as humanization]
            [metabase.query-processor.interface :as i]
            [metabase.sync.interface :as si]
            [metabase.util :as u]
            [metabase.util
             [encryption :as encryption]
             [schema :as su]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private DateTimeUnitKeywordOrString
  "Schema for a valid datetime unit string like \"default\" or \"minute-of-hour\"."
  (s/constrained su/KeywordOrString
                 (fn [unit]
                   (contains? i/datetime-field-units (keyword unit)))
                 "Valid field datetime unit keyword or string"))

(def ResultsMetadata
  "Schema for valid values of the `result_metadata` column."
  (su/with-api-error-message (s/named [{:name                          su/NonBlankString
                                        :display_name                  su/NonBlankString
                                        (s/optional-key :description)  (s/maybe su/NonBlankString)
                                        :base_type                     su/FieldTypeKeywordOrString
                                        (s/optional-key :special_type) (s/maybe su/FieldTypeKeywordOrString)
                                        (s/optional-key :unit)         (s/maybe DateTimeUnitKeywordOrString)
                                        (s/optional-key :fingerprint)  (s/maybe si/Fingerprint)}]
                                      "Valid array of results column metadata maps")
    "value must be an array of valid results column metadata maps."))

(s/defn ^:private results->column-metadata :- (s/maybe ResultsMetadata)
  "Return the desired storage format for the column metadata coming back from RESULTS, or `nil` if no columns were returned."
  [results]
  ;; rarely certain queries will return columns with no names, for example `SELECT COUNT(*)` in SQL Server seems to come back with no name
  ;; since we can't use those as field literals in subsequent queries just filter them out
  (seq (for [col   (:cols results)
             :when (seq (:name col))]
         (merge
          ;; if base-type isn't set put a default one in there. Similarly just use humanized value of `:name` for `:display_name` if one isn't set
          {:base_type    :type/*
           :display_name (humanization/name->human-readable-name (name (:name col)))}
          (u/select-non-nil-keys col [:name :display_name :description :base_type :special_type :unit :fingerprint])
          ;; since years are actually returned as text they can't be used for breakout purposes so don't advertise them as DateTime columns
          (when (= (:unit col) :year)
            {:base_type :type/Text
             :unit      nil})))))

;; TODO - is there some way we could avoid doing this every single time a Card is ran? Perhaps by passing the current Card
;; metadata as part of the query context so we can compare for changes
(defn- record-metadata! [card-id metadata]
  (when metadata
    (db/update! 'Card card-id
      :result_metadata metadata)))

(defn- metadata-checksum
  "Simple, checksum of the column results METADATA.
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
    (encryption/maybe-encrypt (codec/base64-encode (hash/md5 (json/generate-string metadata))))))

(defn valid-checksum?
  "Is the CHECKSUM the right one for this column METADATA?"
  [metadata checksum]
  (and metadata
       checksum
       (= (encryption/maybe-decrypt (metadata-checksum metadata))
          (encryption/maybe-decrypt checksum))))

(defn record-and-return-metadata!
  "Middleware that records metadata about the columns returned when running the query if it is associated with a Card."
  [qp]
  (fn [{{:keys [card-id nested?]} :info, :as query}]
    (let [results (qp query)]
      (try
        (let [metadata (results->column-metadata results)]
          ;; At the very least we can skip the Extra DB call to update this Card's metadata results
          ;; if its DB doesn't support nested queries in the first place
          (when (i/driver-supports? :nested-queries)
            (when (and card-id
                       (not nested?))
              (record-metadata! card-id metadata)))
          ;; add the metadata and checksum to the response
          (assoc results :results_metadata {:checksum (metadata-checksum metadata)
                                            :columns  metadata}))
        ;; if for some reason we weren't able to record results metadata for this query then just proceed as normal
        ;; rather than failing the entire query
        (catch Throwable e
          (log/error "Error recording results metadata for query:" (.getMessage e) "\n"
                     (u/pprint-to-str (u/filtered-stacktrace e)))
          results)))))
