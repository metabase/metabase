(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries with a first stage like

    {:stages [{:source-card 1 ...}]

  and resolves the referenced source query, transforming the query to look like the following:

    {:stages [{:lib/stage-metadata ...  ; metadata for Card 1
               ...}                     ; stage(s) spliced in from Card 1
              {...}]}                   ; original stages specified in query

  This middleware resolves `:source-card` at all levels of the query. The query-or-join `:database` key often uses the
  so-called [[mbql.s/saved-questions-virtual-database-id]], because the frontend client might not know the original
  Database; this middleware will replace that ID with the appropriate ID, e.g.

    {:database <virtual-id>, :stages [{:source-card 1}]}
    ->
    {:database 1, :stages ...}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.lib.convert :as lib.convert]))

(set! *warn-on-reflection* true)

;; NOCOMMIT TODO
:source-query/dataset?
:persisted-info/native

;; TODO -- WHY IS THIS PART OF THIS MIDDLEWARE!
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

(mu/defn ^:private source-stages :- ::lib.schema/stages
  "Get the query to be run from the card"
  [{{:keys [stages]} :dataset-query, card-id :id, :as _card} :- lib.metadata/CardMetadata]
  (if-not (:native (first stages))
    ;; first stage is not a native query
    stages
    ;; first stage IS a native query
    (cond-> stages
      ;; trim trailing comments from SQL, but not other types of native queries. TODO -- icky hack
      (isa? driver/hierarchy driver/*driver* :sql)
      (update :native (partial trim-sql-query card-id)))))

(mu/defn ^:private card-metadata :- [:merge
                                     lib.metadata/CardMetadata
                                     ;; must have dataset-query !
                                     [:map
                                      [:dataset-query :map]]]
  [query   :- ::lib.schema/query
   card-id :- ::lib.schema.id/card]
  (or (-> (lib.metadata/card query card-id)
          (m/update-existing :dataset-query lib.convert/->pMBQL))
      (throw (ex-info (tru "Card {0} does not exist." card-id)
                      {:card-id card-id}))))

#_(mu/defn card-id->source-query-and-metadata :- SourceQueryAndMetadata
  "Return the source query info for Card with `card-id`. Pass true as the optional second arg `log?` to enable
  logging. (The circularity check calls this and will print more than desired)"
  ([query card-id]
   (card-id->source-query-and-metadata query card-id false))

  ([query   :- ::lib.schema/query
    card-id :- ::lib.schema.id/card
    log?    :- :boolean]
   (let [card           (card-metadata query card-id)
         ;; TODO -- should this be part of the MetadataProvider protocol?
         persisted-info (t2/select-one PersistedInfo :card_id card-id)

         {{database-id :database} :dataset-query
          :keys                   [result-metadata]
          dataset?                :dataset} card

         persisted?    (qp.persisted/can-substitute? card persisted-info)
         source-stages (source-stages card)]
     (when (and persisted? log?)
       (log/info (trs "Found substitute cached query for card {0} from {1}.{2}"
                      card-id
                      (ddl.i/schema-name {:id database-id} (public-settings/site-uuid))
                      (:table_name persisted-info))))

     ;; log the query at this point, it's useful for some purposes
     (log/debug (trs "Fetched source query stages from Card {0}:" card-id)
                "\n"
                (u/pprint-to-str 'yellow source-stages))

     (cond-> {:stages         (cond-> (vec source-stages)
                                ;; This will be applied, if still appropriate, by the peristence middleware
                                persisted?
                                (assoc-in [0 :persisted-info/native]
                                          (qp.persisted/persisted-info-native-query persisted-info)))
              :database        database-id
              :source-metadata (seq (map mbql.normalize/normalize-source-metadata result-metadata))}
       dataset? (assoc :source-query/dataset? dataset?)))))

(def ^:private QueryOrJoin
  [:or
   [:ref ::lib.schema/query]
   [:ref ::lib.schema.join/join]])

(defn- unresolved-query-or-join?
  [{:keys [stages]}]
  (:source-card (first stages)))

(def ^:private ResolvedQueryOrJoin
  [:and
   QueryOrJoin
   [:map
    ;; should not have the [[mbql.s/saved-questions-virtual-database-id]] any more if we have a Database ID at all.
    [:database {:optional true} ::lib.schema.id/database]]
   [:fn
    {:error/message "Top level without unresolved :source-card"}
    (complement unresolved-query-or-join?)]])

(defn- splice-stages [stages card-stages result-metadata]
  (vec
   (concat
    (if (seq result-metadata)
      (concat
       (butlast card-stages)
       ;; TODO -- convert to pMBQL style metadata?
       [(assoc (last card-stages) :lib/stage-metadata result-metadata)])
      card-stages)
    [(dissoc (first stages) :source-card)]
    (rest stages))))

(defn- check-nested-queries-enabled [query-or-join]
  (when-not (public-settings/enable-nested-queries)
    (throw (ex-info (tru "Nested queries are disabled")
                    {:clause query-or-join, :type qp.error-type/bad-configuration}))))

(defn- check-for-circular-references [card-id previous-card-ids]
  (when (some (partial = card-id) previous-card-ids)
    (throw (ex-info (tru "Circular Card references: {0}"
                         (str/join " → " (conj (vec previous-card-ids) card-id)))
                    {:card-id           card-id
                     :previous-card-ids previous-card-ids
                     :type              qp.error-type/invalid-query}))))

(mu/defn ^:private resolve-one :- ResolvedQueryOrJoin
  [query                                                  :- ::lib.schema/query
   {:keys [stages], ::keys [card-ids], :as query-or-join} :- QueryOrJoin]
  (if-not (unresolved-query-or-join? query-or-join)
    query-or-join
    (let [card-id                                 (:source-card (first stages))
          {:keys [dataset-query result-metadata]} (card-metadata query card-id)
          {database-id :database}                 dataset-query]
      (check-nested-queries-enabled query-or-join)
      (check-for-circular-references card-ids card-ids)
      (->> (merge
            query-or-join
            {:stages    (splice-stages stages (:stages dataset-query) result-metadata)
             ::card-ids (conj (vec card-ids) card-id)}
            (when (:database query-or-join)
              {:database database-id}))
           ;; attempt to recursively resolve, just in case we need to resolve another source Card.
           (resolve-one query)))))

(mu/defn ^:private resolve-all* :- ResolvedQueryOrJoin
  [query :- :map]
  (lib.util/update-query-and-joins
   query
   (fn [query-or-join]
     (println "query-or-join:" query-or-join) ; NOCOMMIT
     (resolve-one query query-or-join))))

(def ^:private ResolvedQueryAndSourceCardID
  [:map
   [:query ResolvedQueryOrJoin]
   [:card-id {:optional true} [:maybe ::lib.schema.id/card]]])

(mu/defn ^:private extract-resolved-card-id :- ResolvedQueryAndSourceCardID
  "If the ID of the Card we've resolved (`:source-card-id`) was added by a previous step, add it
  to `:query` `:info` (so it can be included in the QueryExecution log), then return a map with the resolved
  `:card-id` and updated `:query`."
  [query :- :map]
  (let [card-id (-> query :stages first ::card-ids first)]
    {:query   (cond-> query
                card-id (update-in [:info :card-id] #(or % card-id)))
     :card-id card-id}))

(mu/defn ^:private resolve-all :- ResolvedQueryAndSourceCardID
  "Recursively replace all Card ID source tables in `query` with resolved `:source-query` and `:source-metadata`. Since
  the `:database` is only useful for query-or-join source queries, we'll remove it from all other levels."
  [query :- :map]
  ;; if a `:source-card-id` is already in the query, remove it, so we don't pull user-supplied input up into `:info`
  ;; allowing someone to bypass permissions
  (-> (m/dissoc-in query [:query :source-card-id])
      resolve-all*
      extract-resolved-card-id))

(defn resolve-card-id-source-tables
  "Middleware that assocs the `:source-query` for this query if it was specified using the shorthand `:source-table`
  `card__n` format."
  [qp]
  (fn [query rff context]
    (let [{:keys [query card-id]} (resolve-all query)]
      (if card-id
        (let [dataset? (:dataset (lib.metadata/card query card-id))]
          (binding [qp.perms/*card-id* (or card-id qp.perms/*card-id*)]
            (qp query
                (fn [metadata]
                  (rff (cond-> metadata dataset? (assoc :dataset dataset?))))
                context)))
        (qp query rff context)))))
