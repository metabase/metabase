(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [trs]]
            [toucan.db :as db]))

(defn- trim-query
  "Native queries can have trailing SQL comments. This works when executed directly, but when we use the query in a
  nested query, we wrap it in another query, which can cause the last part of the query to be unintentionally
  commented out, causing it to fail. This function removes any trailing SQL comment."
  [card-id query-str]
  (let [trimmed-string (str/replace query-str #"--.*(\n|$)" "")]
    (if (= query-str trimmed-string)
      query-str
      (do
        (log/info (trs "Trimming trailing comment from card with id {0}" card-id))
        trimmed-string))))

(defn- card-id->source-query
  "Return the source query info for Card with CARD-ID."
  [card-id]
  (let [card       (db/select-one ['Card :dataset_query :database_id] :id card-id)
        card-query (:dataset_query card)]
    (assoc (or (:query card-query)
               (when-let [native (:native card-query)]
                 {:native        (trim-query card-id (:query native))
                  :template_tags (:template_tags native)})
               (throw (Exception. (str "Missing source query in Card " card-id))))
      ;; include database ID as well; we'll pass that up the chain so it eventually gets put in its spot in the
      ;; outer-query
      :database (:database card-query))))

(defn- source-table-str->source-query
  "Given a SOURCE-TABLE-STR like `card__100` return the appropriate source query."
  [source-table-str]
  (let [[_ card-id-str] (re-find #"^card__(\d+)$" source-table-str)]
    (u/prog1 (card-id->source-query (Integer/parseInt card-id-str))
      (when-not i/*disable-qp-logging*
        (log/info "\nFETCHED SOURCE QUERY FROM CARD" card-id-str ":\n" (u/pprint-to-str 'yellow <>))))))

(defn- expand-card-source-tables
  "If `source-table` is a Card reference (a string like `card__100`) then replace that with appropriate
  `:source-query` information. Does nothing if `source-table` is a normal ID. Recurses for nested-nested queries."
  [inner-query];; {:native
  (let [source-table (qputil/get-normalized inner-query :source-table)
        card-query (qputil/get-normalized inner-query :base-query)]
    (if-not (or (string? source-table) (not (nil? card-query)))
      inner-query
      ;; (recursively) expand the source query
      (let [source-query (expand-card-source-tables (if (nil? source-table)  card-query  (source-table-str->source-query source-table)))]
        (-> inner-query
            ;; remove `source-table` `card__id` key
            (qputil/dissoc-normalized :source-table)
            (qputil/dissoc-normalized :base-query)
            ;; Add new `source-query` info in its place. Pass the database ID up the chain, removing it from the
            ;; source query
            (assoc
              :source-query (dissoc source-query :database)
              :database     (:database source-query)))))))

(defn- fetch-source-query* [{inner-query :query, :as outer-query}]
  (if-not inner-query
    ;; for non-MBQL queries there's nothing to do since they have nested queries
    outer-query
    ;; otherwise attempt to expand any source queries as needed
    (let [expanded-inner-query (expand-card-source-tables inner-query)]
      (merge outer-query
             {:query (dissoc expanded-inner-query :database)}
             (when-let [database (:database expanded-inner-query)]
               {:database database})))))

(defn fetch-source-query
  "Middleware that assocs the `:source-query` for this query if it was specified using the shorthand `:source-table`
  `card__n` format."
  [qp]
  (comp qp fetch-source-query*))
