(ns metabase.queries.metadata
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.field :as schema.field]
   [metabase.warehouse-schema.table :as schema.table]
   [toucan2.core :as t2]))

;; This is similar to the function in [[metabase.warehouses-rest.api]], but we want to allow filtering the DBs in case
;; of audit database, we don't want to allow users to modify its queries.
(mu/defn- get-native-perms-info :- [:enum :write :none]
  "Calculate `:native_permissions` field for the passed database describing the current user's permissions for running
  native (e.g. SQL) queries. Will be either `:write` or `:none`. `:write` means you can run ad-hoc native queries,
  and save new Cards with native queries; `:none` means you can do neither.

  For the curious: the use of `:write` and `:none` is mainly for legacy purposes, when we had data-access-based
  permissions; there was a specific option where you could give a Perms Group permissions to run existing Cards with
  native queries, but not to create new ones. With the advent of what is currently being called 'Space-Age
  Permissions', all Cards' permissions are based on their parent Collection, removing the need for native read perms."
  [db :- [:map]]
  (if (and (not (:is_audit db))
           (= :query-builder-and-native
              (perms/full-db-permission-for-user
               api/*current-user-id*
               :perms/create-queries
               (u/the-id db))))
    :write
    :none))

(defn- get-databases
  [ids]
  (when (seq ids)
    (perms/prime-db-cache ids)
    (into [] (comp (filter mi/can-read?)
                   (map #(assoc % :native_permissions (get-native-perms-info %))))
          (t2/select :model/Database :id [:in ids]))))

(defn- field-ids->table-ids
  [field-ids]
  (if (seq field-ids)
    (t2/select-fn-set :table_id :model/Field :id [:in field-ids])
    #{}))

(defn- collect-recursive-snippets
  ([initial-snippet-ids]
   (when (seq initial-snippet-ids)
     (let [snippets (t2/select :model/NativeQuerySnippet :id [:in initial-snippet-ids])]
       (collect-recursive-snippets (set snippets) snippets (set initial-snippet-ids)))))
  ([all-snippets snippets-to-recurse seen-ids]
   (let [->nested-snippet-ids (fn [snippet]
                                (when snippet
                                  (for [tag   (vals (:template_tags snippet))
                                        :when (= "snippet" (:type tag))
                                        :let  [snippet-id (:snippet-id tag)]
                                        :when (and snippet-id
                                                   (not (contains? seen-ids snippet-id)))]
                                    snippet-id)))
         nested-snippet-ids   (into #{} (mapcat ->nested-snippet-ids) snippets-to-recurse)
         nested-snippets      (when (seq nested-snippet-ids)
                                (t2/select :model/NativeQuerySnippet :id [:in nested-snippet-ids]))]
     (if-not (seq nested-snippet-ids)
       all-snippets
       (recur (into all-snippets nested-snippets)
              nested-snippets
              (set/union seen-ids nested-snippet-ids))))))

(defn- collect-snippet-field-ids
  [snippets]
  (set
   (for [snippet snippets
         :when   (:template_tags snippet)
         tag     (vals (:template_tags snippet))
         :when   (#{:dimension :temporal-unit} (:type tag))
         :let    [dimension (:dimension tag)
                  ;; Handle both keyword and string field references
                  [dim-type field-id] (cond
                                        (vector? dimension) dimension
                                        (string? dimension) (try
                                                              (read-string dimension)
                                                              (catch Exception _ nil))
                                        :else               nil)]
         :when   (and (#{:field "field"} dim-type)
                      (integer? field-id))]
     field-id)))

(mu/defn- batch-fetch-query-metadata*
  "Fetch dependent metadata for ad-hoc queries.
  Options:
    - `include-sensitive-fields?` - if true, includes fields with visibility_type :sensitive (default false)"
  [queries :- [:maybe [:sequential ::lib.schema/query]]
   opts    :- [:maybe [:map [:include-sensitive-fields? {:optional true} :boolean]]]]
  (let [source-table-ids       (into #{}
                                     (mapcat lib/all-source-table-ids)
                                     queries)
        source-card-ids        (into #{}
                                     (mapcat lib/all-source-card-ids)
                                     queries)
        source-tables          (concat (schema.table/batch-fetch-table-query-metadatas source-table-ids opts)
                                       (schema.table/batch-fetch-card-query-metadatas source-card-ids
                                                                                      {:include-database? false}))
        fk-target-field-ids    (into #{} (comp (mapcat :fields)
                                               (keep :fk_target_field_id))
                                     source-tables)
        fk-target-table-ids    (into #{} (remove source-table-ids)
                                     (field-ids->table-ids fk-target-field-ids))
        fk-target-tables       (schema.table/batch-fetch-table-query-metadatas fk-target-table-ids opts)
        tables                 (concat source-tables fk-target-tables)
        template-tag-field-ids (into #{} (mapcat lib/all-template-tag-field-ids) queries)
        direct-snippet-ids     (into #{} (mapcat lib/all-template-tag-snippet-ids) queries)
        snippets               (collect-recursive-snippets direct-snippet-ids)
        snippet-field-ids      (collect-snippet-field-ids snippets)
        ;; Combine all field IDs
        all-field-ids          (set/union template-tag-field-ids snippet-field-ids)
        query-database-ids     (into #{} (keep :database) queries)
        database-ids           (into query-database-ids
                                     (keep :db_id)
                                     tables)]
    {;; TODO: This is naive and issues multiple queries currently. That's probably okay for most dashboards,
     ;; since they tend to query only a handful of databases at most.
     :databases (sort-by :id (get-databases database-ids))
     ;; apparently some of these tables come back with normal integer IDs and some come back with string IDs... not sure
     ;; what the hecc is going on but I guess maybe some of them in 2024 are still using that old `card__<id>` hack or
     ;; something. Idk. Anyways let's just sort the ones with numeric IDs first and the ones with string IDs last. We're
     ;; sorting these in a sane order because lots of tests expect them to be sorted by numeric ID and break if you sort
     ;; by something like `(str (:id %))`. -- Cam
     :tables    (sort-by (fn [{:keys [id]}]
                           (if (integer? id)
                             [id ""]
                             [Integer/MAX_VALUE (str id)]))
                         tables)
     :fields    (sort-by :id (schema.field/get-fields all-field-ids))
     ;; Add snippets to the response
     :snippets  (sort-by :id snippets)}))

(defn batch-fetch-query-metadata
  "Fetch dependent metadata for ad-hoc queries.
  Options:
    - `include-sensitive-fields?` - if true, includes fields with visibility_type :sensitive (default false)"
  ([queries]
   (batch-fetch-query-metadata queries nil))
  ([queries opts]
   (batch-fetch-query-metadata*
    (into []
          (comp (filter not-empty)
                (map lib-be/normalize-query))
          queries)
    opts)))

(mu/defn batch-fetch-card-metadata
  "Fetch dependent metadata for cards.

  Models and native queries need their definitions walked as well as their own, card-level metadata."
  [cards :- [:sequential ::queries.schema/card]]
  (let [;; remove any Cards with empty queries
        cards (remove #(empty? (:dataset_query %)) cards)
        ;; All the queries on all the cards
        card-queries (map :dataset_query cards)
        ;; Plus the card-level metadata of each model and native query
        queries (into []
                      (comp (filter (fn [{query :dataset_query, card-type :type, :as _card}]
                                      (or (= card-type :model)
                                          (lib/native-only-query? query))))
                            (map (fn [{database-id :database_id, card-id :id, :as _card}]
                                   (let [mp (lib-be/application-database-metadata-provider database-id)]
                                     (lib/query mp (lib.metadata/card mp card-id))))))
                      cards)]
    (batch-fetch-query-metadata (concat card-queries queries))))

(defn- click-behavior->link-details
  [{:keys [linkType type targetId] :as _click-behavior}]
  (when (= type "link")
    (when-let [link-type (case linkType
                           "question"  :card
                           "dashboard" :dashboard
                           nil)]
      {:type link-type
       :id   targetId})))

(mu/defn- get-cards :- [:maybe [:sequential [:map [:id ::lib.schema.id/card]]]]
  [ids :- [:maybe [:or
                   [:sequential ::lib.schema.id/card]
                   [:set ::lib.schema.id/card]]]]
  (when (seq ids)
    (let [cards (into [] (filter mi/can-read?)
                      (t2/select :model/Card :id [:in ids]))]
      (t2/hydrate cards :can_write))))

(defn- dashcard->click-behaviors [dashcard]
  (let [viz-settings        (:visualization_settings dashcard)
        top-click-behavior  (:click_behavior viz-settings)
        col-click-behaviors (keep (comp :click_behavior val)
                                  (:column_settings viz-settings))]
    (conj col-click-behaviors top-click-behavior)))

(defn- batch-fetch-linked-dashboards
  [dashboard-ids]
  (when (seq dashboard-ids)
    (let [dashboards (->> (t2/select :model/Dashboard :id [:in dashboard-ids])
                          (filter mi/can-read?))]
      (t2/hydrate dashboards
                  :can_write
                  :param_fields))))

(defn- batch-fetch-dashboard-links
  [dashcards]
  (let [links      (group-by :type
                             (into #{} (comp (mapcat dashcard->click-behaviors)
                                             (keep click-behavior->link-details))
                                   dashcards))
        link-cards (get-cards (into #{} (map :id) (:card links)))
        dashboards (->> (:dashboard links)
                        (into #{} (map :id))
                        batch-fetch-linked-dashboards)]
    {:cards      (sort-by :id link-cards)
     :dashboards (sort-by :id dashboards)}))

(mu/defn batch-fetch-dashboard-metadata
  "Fetch dependent metadata for dashboards."
  [dashboards :- [:sequential
                  [:map {:optional true} [:dashcards
                                          [:sequential
                                           [:map
                                            [:card   {:optional true} [:maybe ::queries.schema/card]]
                                            [:series {:optional true} [:maybe [:sequential [:map
                                                                                            [:dataset_query ::queries.schema/query]]]]]]]]]]]
  (let [dashcards (mapcat :dashcards dashboards)
        cards     (for [{:keys [card series]} dashcards
                        :let   [all (conj series card)]
                        card all]
                    card)
        card-ids  (into #{} (map :id) cards)
        links     (batch-fetch-dashboard-links dashcards)]
    (merge
     (->> (remove (comp card-ids :id) (:cards links))
          (concat cards)
          (filter some?)
          batch-fetch-card-metadata)
     {:cards      (or (:cards links)      [])
      :dashboards (or (:dashboards links) [])})))
