(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries like

    {:source-table \"card__1\" ; Shorthand for using Card 1 as source query
     ...}

  and resolves the referenced source query, transforming the query to look like the following:

    {:source-query    {...} ; Query for Card 1
     :source-metadata [...] ; metadata about columns in Card 1
     :source-card-id  1     ; Original Card ID
     ...}

  This middleware resolves Card ID `:source-table`s at all levels of the query, but the top-level query often uses the
  so-called `virtual-id`, because the frontend client might not know the original Database; this middleware will
  replace that ID with the appropriate ID, e.g.

    {:database <virtual-id>, :type :query, :query {:source-table \"card__1\"}}
    ->
    {:database 1, :type :query, :query {:source-query {...}, :source-metadata {...}, :source-card-id 1}}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require
   [clojure.string :as str]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models.persisted-info
    :as persisted-info
    :refer [PersistedInfo]]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.util.persisted-cache :as qp.persisted]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private FullyResolvedQuery
  "Schema for a MBQL query where all `:source-card` stages have been replaced by their underlying stages, and where the
  top-level `:database` ID, if it was the [[mbql.s/saved-questions-virtual-database-id]], is replaced by the actual
  database ID of the source query.

  This schema represents the way the query should look after this middleware finishes preprocessing it."
  [:and
   [:ref ::lib.schema/query]
   [:fn
    {:error/message "Query where all :source-card stages are fully resolved"}
    (fn [query]
      ((some-fn :source-table :native) (lib.util/query-stage query 0)))]
   [:map
    [:database
     [:fn
      {:error/message "Query where source-query virtual `:database` has been replaced with actual Database ID"}
      (every-pred integer? pos?)]]]])

(mu/defn ^:private trim-sql-query :- ::lib.schema.common/non-blank-string
  "Native queries can have trailing SQL comments. This works when executed directly, but when we use the query in a
  nested query, we wrap it in another query, which can cause the last part of the query to be unintentionally
  commented out, causing it to fail. This function removes any trailing SQL comment."
  [card-id   :- ::lib.schema.id/card
   query-str :- ::lib.schema.common/non-blank-string]
  (let [trimmed-string (str/replace query-str #"--.*(\n|$)" "")]
    (if (= query-str trimmed-string)
      query-str
      (do
        (log/info (trs "Trimming trailing comment from card with id {0}" card-id))
        trimmed-string))))

(mu/defn card-id->source-stages-and-metadata :- SourceStagesAndMetadata
  "Return the source query info for Card with `card-id`. Pass true as the optional second arg `log?` to enable
  logging. (The circularity check calls this and will print more than desired)"
  ([query card-id]
   (card-id->source-stages-and-metadata query card-id false))

  ([query   :- ::lib.schema/query
    card-id :- ::lib.schema.id/card
    log?    :- :boolean]
   (let [ ;; todo: we need to cache this. We are running this in preprocess, compile, and then again
         card           (or (lib.metadata/card query card-id)
                            (throw (ex-info (tru "Card {0} does not exist." card-id)
                                            {:card-id card-id})))
         persisted-info (t2/select-one PersistedInfo :card_id card-id)

         {{database-id :database} :dataset_query
          result-metadata         :result_metadata
          dataset?                :dataset} card
         persisted?                         (qp.persisted/can-substitute? card persisted-info)
         stages                             (source-stages card)]
     (when (and persisted? log?)
       (log/info (trs "Found substitute cached query for card {0} from {1}.{2}"
                      card-id
                      (ddl.i/schema-name {:id database-id} (public-settings/site-uuid))
                      (:table_name persisted-info))))
     ;; log the query at this point, it's useful for some purposes
     (log/debug (trs "Fetched source query from Card {0}:" card-id)
                "\n"
                (u/pprint-to-str 'yellow stages))
     (cond-> {:source-stages    (cond-> stages
                                  ;; This will be applied, if still appropriate, by the peristence middleware
                                  persisted?
                                  (assoc :persisted-info/native
                                         (qp.persisted/persisted-info-native-query persisted-info)))
              :database        database-id
              :source-metadata (seq (map mbql.normalize/normalize-source-metadata result-metadata))}
       dataset? (assoc :source-query/dataset? dataset?)))))

(def ^:private ^:dynamic *already-resolved-card-ids* [])

(mu/defn ^:private resolve-card :- lib.metadata/CardMetadata
  [query card-id :- ::lib.schema.id/card]
  ;; check to make sure this isn't an infinitely recursive source reference.
  (when (some #(= % card-id) *already-resolved-card-ids*)
    (throw (ex-info (tru "Recursive source Cards: {0}"
                         (str/join " -> " (concat *already-resolved-card-ids* [card-id])))
                    {:card-id card-id, :type qp.error-type/invalid-query})))
  (when-not (public-settings/enable-nested-queries)
    (throw (ex-info (trs "Nested queries are disabled")
                    {:card-id card-id, :type qp.error-type/unsupported-feature})))
  (or (lib.metadata/card query card-id)
      (throw (ex-info (tru "Card {0} does not exist." card-id)
                      {:card-id card-id, :type qp.error-type/invalid-query}))))

(mu/defn ^:private resolve-card-id-source-tables* :- [:map
                                                      [:query FullyResolvedQuery]
                                                      [:card-id {:optional true} ::lib.schema.id/card]]
  [query :- ::lib.schema/query]
  (let [{:keys [source-card], :as _first-stage} (lib.util/query-stage query 0)]
    (if-not source-card
      {:query query}
      (let [card        (resolve-card query source-card)
            card-query  (or (:dataset-query card)
                            (throw (ex-info (tru "Missing source query in Card {0}" source-card)
                                            {:card card, :type qp.error-type/invalid-query})))
            card-stages (:stages (lib.convert/->pMBQL card-query))]
        (assert (seq card-stages))
        (log/debugf "Resolved Card %d to stages:\n%s" source-card (u/pprint-to-str card-stages))
        ;; TODO -- stage metadata
        ;;
        ;; TODO `:source-query/dataset?`
        ;;
        ;; TODO `:persisted-info/native`
        ;;
        ;; TODO [[trim-sql-query]] -- why isn't this separate middleware?
        {:query   (let [resolved-query (-> query
                                           (update :stages (fn [existing-stages]
                                                             (into (vec card-stages)
                                                                   (concat
                                                                    [(dissoc (first existing-stages) :source-card)]
                                                                    (rest existing-stages)))))
                                           (update :database (fn [database]
                                                               (if (= database mbql.s/saved-questions-virtual-database-id)
                                                                 (:database card-query)
                                                                 database))))]
                    ;; cool, now recursively resolve our stuff.
                    (:query (binding [*already-resolved-card-ids* (conj *already-resolved-card-ids* source-card)]
                              (resolve-card-id-source-tables* resolved-query))))
         :card-id source-card}))))

(defn resolve-card-id-source-tables
  "Middleware that assocs the `:source-query` for this query if it was specified using the shorthand `:source-table`
  `card__n` format."
  [qp]
  (fn [query rff context]
    (let [{:keys [query card-id]} (resolve-card-id-source-tables* query)]
      (if card-id
        (let [dataset? (:dataset (lib.metadata/card query card-id))]
          (binding [qp.perms/*card-id* (or card-id qp.perms/*card-id*)]
            ;; TODO (update-in [:info :card-id] #(or % card-id))
            (qp query
                (fn [metadata]
                  (rff (cond-> metadata dataset? (assoc :dataset dataset?))))
                context)))
        (qp query rff context)))))
