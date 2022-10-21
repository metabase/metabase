(ns metabase.api.app
  (:require
    [clojure.set :as set]
    [clojure.string :as str]
    [clojure.walk :as walk]
    [compojure.core :refer [POST PUT]]
    [medley.core :as m]
    [metabase.api.card :as api.card]
    [metabase.api.collection :as api.collection]
    [metabase.api.common :as api]
    [metabase.mbql.schema :as mbql.s]
    [metabase.models :refer [App Card Dashboard ModelAction Table]]
    [metabase.models.action :as action]
    [metabase.models.app.graph :as app.graph]
    [metabase.models.collection :as collection]
    [metabase.models.dashboard :as dashboard]
    [metabase.plugins.classloader :as classloader]
    [metabase.util :as u]
    [metabase.util.i18n :as i18n]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(defn- hydrate-details
  [apps & additional-features]
  (apply hydrate apps [:collection :can_write] additional-features))

(defn- create-app! [{:keys [collection] :as app}]
  (db/transaction
   (let [coll-params (select-keys collection [:name :color :description :authority_level])
         collection-instance (api.collection/create-collection!
                              (assoc coll-params :namespace :apps))
         app-params (-> app
                        (select-keys [:dashboard_id :options :nav_items])
                        (assoc :collection_id (:id collection-instance)))
         app (db/insert! App app-params)]
     (hydrate-details app))))

(api/defendpoint POST "/"
  "Endpoint to create an app"
  [:as {{:keys [dashboard_id options nav_items]
         {:keys [name color description namespace authority_level]} :collection
         :as app} :body}]
  {dashboard_id    (s/maybe su/IntGreaterThanOrEqualToZero)
   options         (s/maybe su/Map)
   nav_items       (s/maybe [(s/maybe su/Map)])
   name            su/NonBlankString
   color           collection/hex-color-regex
   description     (s/maybe su/NonBlankString)
   namespace       (s/maybe su/NonBlankString)
   authority_level collection/AuthorityLevel}
  (create-app! app))

(api/defendpoint PUT "/:app-id"
  "Endpoint to change an app"
  [app-id :as {{:keys [dashboard_id options nav_items] :as body} :body}]
  {app-id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav_items (s/maybe [(s/maybe su/Map)])}
  (api/write-check App app-id)
  (db/update! App app-id (select-keys body [:dashboard_id :options :nav_items]))
  (hydrate-details (db/select-one App :id app-id)))

(api/defendpoint GET "/"
  "Fetch a list of all Apps that the current user has read permissions for.

  By default, this returns Apps with non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`."
  [archived]
  {archived (s/maybe su/BooleanString)}
  (let [archived? (Boolean/parseBoolean archived)]
    (hydrate-details
     (db/select [App :app.*]
       {:left-join [:collection [:= :collection.id :app.collection_id]]
        :where    [:and
                   [:= :collection.archived archived?]
                   (collection/visible-collection-ids->honeysql-filter-clause
                    (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
        :order-by [[:%lower.collection.name :asc]]}))))

(api/defendpoint GET "/:id"
  "Fetch a specific App"
  [id]
  (hydrate-details (api/read-check App id) :models))

(defn- replace-scaffold-targets
  [structure scaffold-target->target-id]
  (walk/postwalk
    (fn [node]
      (if-let [target-id (get scaffold-target->target-id node)]
        target-id
        node))
    structure))

(defn- create-scaffold-cards-and-pages!
  "Insert new cards and pages (dashboards), keep track of scaffold-target->id for each insert.
   If an item has a `scaffold-target` field, its id should be added to the accumulator."
  [collection-id cards pages]
  ;; We create the cards so we can replace scaffold-target-id elsewhere
  (let [scaffold-target->id (reduce
                              (fn [accum {:keys [scaffold-target] :as card}]
                                (when-not scaffold-target
                                  (throw (ex-info (i18n/tru "A scaffold-target was not provided for Card: {0}" (:name card))
                                                  {:status-code 400})))
                                (let [card (api.card/create-card! (-> card
                                                                      (replace-scaffold-targets accum)
                                                                      (assoc :collection_id collection-id)
                                                                      (dissoc :scaffold-target)))]
                                  (when (:dataset card)
                                    (db/insert-many! ModelAction [{:card_id (:id card) :slug "insert" :requires_pk false}
                                                                  {:card_id (:id card) :slug "update" :requires_pk true}
                                                                  {:card_id (:id card) :slug "delete" :requires_pk true}]))
                                  (cond-> (assoc accum (into ["scaffold-target-id"] scaffold-target) (:id card))
                                    (:dataset card)
                                    (assoc (conj (into ["scaffold-target-id"] scaffold-target) "card") (str "card__" (:id card))))))
                              {}
                              cards)]
    ;; We create the dashboards (without dashcards) so we can replace scaffold-target-id elsewhere
    (reduce
      (fn [accum {:keys [scaffold-target] :as page}]
        (when-not scaffold-target
          (throw (ex-info (i18n/tru "A scaffold-target was not provided for Page: {0}" (:name page))
                          {:status-code 400})))
        (let [blank-page (-> page
                             (assoc :collection_id collection-id
                                    :is_app_page true
                                    :creator_id api/*current-user-id*)
                             (dissoc :ordered_cards :scaffold-target))
              dashboard (db/insert! Dashboard blank-page)]
          (assoc accum (into ["scaffold-target-id"] scaffold-target) (:id dashboard))))
      scaffold-target->id
      pages)))

(defn- create-scaffold-dashcards! [scaffold-target->id pages]
  (doseq [{:keys [ordered_cards scaffold-target]} pages
          :let [dashboard-id (get scaffold-target->id (into ["scaffold-target-id"] scaffold-target))]]
    ;; if dashcards need to refer to each other with scaffold-target they must be in the right order
    (reduce (fn [accum {:keys [scaffold-target] :as dashcard}]
              (let [{dashcard-id :id} (dashboard/add-dashcard!
                                        dashboard-id
                                        (:card_id dashcard)
                                        (replace-scaffold-targets dashcard accum))]
                (cond-> accum
                  scaffold-target (assoc (into ["scaffold-target-id"] scaffold-target) dashcard-id))))
            {}
            ordered_cards)))

(def ^:private page-type-display
  {"model" {:name (i18n/tru "Model")
            :display "table"}
   "list" {:name (i18n/tru "List")
           :display "list"}
   "detail" {:name (i18n/tru "Detail")
             :display "object"}})

(defn- generate-models [table-ids table-id->table]
  (for [table-id table-ids
        :let [table (get table-id->table table-id)
              order-by-field-id (->> table
                                     :fields
                                     (keep (fn [field]
                                             (let [field-name (str/lower-case (:name field))]
                                               (cond
                                                 (= field-name "updated_at")
                                                 {:priority 0 :field-id (:id field)}

                                                 (= field-name "created_at")
                                                 {:priority 1 :field-id (:id field)}

                                                 (and (= :type/PK (:semantic_type field))
                                                   (isa? (:base_type field) :type/Number))
                                                 {:priority 2 :field-id (:id field)}))))
                                     (sort-by :priority)
                                     first
                                     :field-id)]]
    {:scaffold-target ["card" "table" table-id "model"]
     :name (or (:display_name table) (:name table))
     :display (get-in page-type-display ["model" :display])
     :visualization_settings {}
     :dataset true
     :dataset_query {:type "query"
                     :database (:db_id table)
                     :query (cond-> {:source_table table-id}
                              order-by-field-id (assoc :order_by [["desc", ["field", order-by-field-id, nil]]]))}}))

(defn- page-infos-and-models-from-table-ids
  [table-ids]
  (when (seq table-ids)
    (let [tables (hydrate (db/select Table :id [:in table-ids]) :fields)
          _ (when (not= (count table-ids) (count tables))
              (throw (ex-info (i18n/tru "Some tables could not be found. Given: {0} Found: {1}"
                                        (pr-str table-ids)
                                        (pr-str (map :id tables)))
                              {:status-code 400})))
          table-id->table (m/index-by :id tables)]
      {:page-infos
       (for [table-id table-ids
             :let [table (get table-id->table table-id)
                   pks (filter (comp #(= :type/PK %) :semantic_type) (:fields table))
                   _ (when (not= 1 (count pks))
                       (throw (ex-info (i18n/tru "Table must have a single primary key: {0}" (:name table))
                                       {:status-code 400})))
                   pk-field (first pks)
                   pk-field-slug (u/slugify (:name pk-field))
                   ident-type "table"]
             page-type ["list" "detail"]]
         {:page-type page-type
          :pk-field-slug pk-field-slug
          :pk-field-name (:name pk-field)
          :pk-field-id (:id pk-field)
          :page-ident table-id
          :ident-type ident-type
          :actions #{"insert" "update" "delete"}
          :model-ref ["scaffold-target-id" "card" ident-type table-id "model"]
          :card-ref ["scaffold-target-id" "card" ident-type table-id "model" "card"]
          :page-name (format "%s %s"
                             (or (:display_name table) (:name table))
                             (get-in page-type-display [page-type :name]))})
       :models (generate-models table-ids table-id->table)})))

(defn- page-infos-from-model-ids
  [model-ids]
  (when (seq model-ids)
    (let [models (db/select Card :id [:in model-ids])
          model-id->model (m/index-by :id models)
          model-id->params (action/implicit-action-parameters models)]
      (for [model-id model-ids
            :let [model (get model-id->model model-id)
                  params (get model-id->params model-id)
                  pks (filter ::action/pk? params)
                  _ (when (not= 1 (count pks))
                      (throw (ex-info (i18n/tru "Model must have a single primary key: {0}" (:name model))
                                      {:status-code 400})))
                  pk-param (first pks)
                  pk-field-slug (:id pk-param)
                  ident-type "model"]
            page-type ["list" "detail"]]
        {:page-type page-type
         :pk-field-slug pk-field-slug
         :pk-field-id (::action/field-id pk-param)
         :pk-field-name (:id pk-param)
         :page-ident model-id
         :ident-type ident-type
         :actions #{"insert" "update" "delete"}
         :model-ref model-id
         :card-ref (str "card__" model-id)
         :page-name (format "%s %s"
                            (:name model)
                            (get-in page-type-display [page-type :name]))}))))

(defn- generate-scaffold
  [app-name source-table-ids]
  (let [table-ids (filter number? (distinct source-table-ids))
        extract-model-id #(if-let [[_ card-id] (and (string? %) (re-find #"^card__(\d+)$" %))]
                           (parse-long card-id)
                           %)
        model-ids (->> source-table-ids
                       distinct
                       (filter string?)
                       (map extract-model-id))
        page-sort (->> source-table-ids
                       (map (juxt #(if (string? %) "model" "table")
                                  extract-model-id))
                       m/indexed
                       (into {})
                       set/map-invert)
        {:keys [page-infos models]} (page-infos-and-models-from-table-ids table-ids)
        page-infos (->> (page-infos-from-model-ids model-ids)
                        (concat page-infos)
                        (sort-by (comp page-sort (juxt :ident-type :page-ident))))]
    {:app {:collection {:name app-name :color "#FFA500"}
           :dashboard_id ["scaffold-target-id" "page" (:ident-type (first page-infos)) (:page-ident (first page-infos)) "list"]
           :nav_items (for [{:keys [ident-type page-ident page-type]} page-infos]
                        (cond-> {:page_id ["scaffold-target-id" "page" ident-type page-ident page-type]}
                          (= page-type "detail") (assoc :indent 1 :hidden true)))}
     :cards (into (vec models)
                  (for [{:keys [page-name page-type ident-type page-ident card-ref]} page-infos]
                    {:scaffold-target ["card" ident-type page-ident page-type]
                     :name page-name
                     :display (get-in page-type-display [page-type :display])
                     :visualization_settings (cond-> {}
                                               (= page-type "list") (assoc "actions.bulk_enabled" false))
                     :dataset_query {:database mbql.s/saved-questions-virtual-database-id,
                                     :type "query",
                                     :query {:source_table card-ref}}}))
     :pages (for [{:keys [ident-type page-type pk-field-slug pk-field-name pk-field-id page-ident page-name model-ref actions]} page-infos]
              (cond->
                {:name page-name
                 :scaffold-target ["page" ident-type page-ident page-type]
                 :ordered_cards (if (= "list" page-type)
                                  (cond-> [{:size_y 12 :size_x 18 :row 1 :col 0
                                            :card_id ["scaffold-target-id" "card" ident-type page-ident page-type]
                                            :visualization_settings {"click_behavior"
                                                                     {"type" "link"
                                                                      "linkType" "page"
                                                                      "parameterMapping" {(str "scaffold_" page-ident)
                                                                                          {"source" {"type" "column",
                                                                                                     "id" pk-field-name
                                                                                                     "name" pk-field-name},
                                                                                           "target" {"type" "parameter",
                                                                                                     "id" (str "scaffold_" page-ident)},
                                                                                           "id" (str "scaffold_" page-ident)}}
                                                                      "targetId" ["scaffold-target-id" "page" ident-type page-ident "detail"]}}}]
                                    (contains? actions "insert")
                                    (conj {:size_y 1 :size_x 2 :row 0 :col 16
                                           :card_id model-ref
                                           :visualization_settings {"virtual_card" {"display" "action"}
                                                                    "button.label" (i18n/tru "New"),
                                                                    "action_slug" "insert"}}))
                                  (cond-> [{:size_y 12 :size_x 18 :row 1 :col 0
                                            :parameter_mappings [{"parameter_id" (str "scaffold_" page-ident)
                                                                  "card_id" ["scaffold-target-id" "card" ident-type page-ident "detail"]
                                                                  "target" ["dimension", ["field", pk-field-id nil]]}]
                                            :card_id ["scaffold-target-id" "card" ident-type page-ident "detail"]
                                            :scaffold-target ["dashcard" ident-type page-ident]}
                                           {:size_y 1 :size_x 3 :row 0 :col 0
                                            :visualization_settings {"virtual_card" {"display" "action"}
                                                                     "button.label" (i18n/tru "← Back to list"),
                                                                     "click_behavior" {"type" "link" "linkType" "page" "targetId" ["scaffold-target-id" "page" ident-type page-ident "list"]}}}]

                                    (contains? actions "delete")
                                    (conj {:size_y 1 :size_x 2 :row 0 :col 16
                                           :card_id model-ref
                                           :parameter_mappings [{"parameter_id" (str "scaffold_" page-ident)
                                                                 "target" ["variable", ["template-tag", pk-field-slug]]}]
                                           :visualization_settings {"virtual_card" {"display" "action"}
                                                                    "button.label" (i18n/tru "Delete"),
                                                                    "button.variant" "danger"
                                                                    "action_slug" "delete"}})

                                    (contains? actions "update")
                                    (conj {:size_y 1 :size_x 2 :row 0 :col 14
                                           :card_id model-ref
                                           :parameter_mappings [{"parameter_id" (str "scaffold_" page-ident)
                                                                 "target" ["variable", ["template-tag", pk-field-slug]]}]
                                           :visualization_settings {"virtual_card" {"display" "action"}
                                                                    "button.label" (i18n/tru "Edit"),
                                                                    "action_slug" "update"}})))}
                (= "detail" page-type) (assoc :parameters [{:name "ID",
                                                            :slug "id",
                                                            :id (str "scaffold_" page-ident),
                                                            :type "id",
                                                            :hidden true
                                                            :sectionId "id"}])))}))

(api/defendpoint POST "/scaffold"
  "Endpoint to scaffold a fully working data-app"
  [:as {{:keys [table-ids app-name]} :body}]
  (db/transaction
    (let [{:keys [app pages cards] :as scaffold} (generate-scaffold app-name table-ids)
          ;; Create a blank app with just the collection info, we will update the rest later after we replace scaffold-target-id
          {app-id :id {collection-id :id} :collection} (create-app! (select-keys app [:collection]))
          scaffold-target->id (create-scaffold-cards-and-pages! collection-id cards pages)
          ;; now replace targets with actual ids
          {:keys [app pages]} (replace-scaffold-targets scaffold scaffold-target->id)]
      (db/update! App app-id (select-keys app [:dashboard_id :options :nav_items]))
      (create-scaffold-dashcards! scaffold-target->id pages)
      (hydrate-details (db/select-one App :id app-id)))))

(api/defendpoint POST "/:app-id/scaffold"
  "Endpoint to scaffold a new table onto an existing data-app"
  [app-id :as {{:keys [table-ids]} :body}]
  (api/write-check App app-id)
  (db/transaction
    (let [{app-id :id app-name :name nav-items :nav_items {collection-id :id} :collection} (hydrate-details (db/select-one App :id app-id))
          ;; We can scaffold this as a new app, but use the existing collection-id and nav-items to merge into the existing app
          {:keys [pages cards] :as scaffold} (generate-scaffold app-name table-ids)
          scaffold-target->id (create-scaffold-cards-and-pages! collection-id cards pages)
          ;; now replace targets with actual ids
          {:keys [app pages]} (replace-scaffold-targets scaffold scaffold-target->id)]
      ;; update nav items
      (db/update! App app-id {:nav_items (vec (concat nav-items (:nav_items app)))})
      (create-scaffold-dashcards! scaffold-target->id pages)
      (hydrate-details (db/select-one App :id app-id)))))


;;; ------------------------------------------------ GRAPH ENDPOINTS -------------------------------------------------

(api/defendpoint GET "/global-graph"
  "Fetch the global graph of all App Permissions."
  []
  (api/check-superuser)
  (app.graph/global-graph))

(defn- resolve-advanced-app-permission-function
  "Resolve `fn-name` in the advanced app permission namespace. `fn-name` can be
  a string or an instance of clojure.lang.Named.
  Throws an exception if `fn-name` cannot be resolved."
  [fn-name]
  (or (u/ignore-exceptions
       (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions.app-permissions)
       (resolve (symbol "metabase-enterprise.advanced-permissions.models.permissions.app-permissions"
                        (name fn-name))))
      (ex-info
       (i18n/tru "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature.")
       {:status-code 402})))

(api/defendpoint GET "/graph"
  "Fetch the graph of all App Permissions."
  []
  (api/check-superuser)
  (let [graph (resolve-advanced-app-permission-function 'graph)]
    (graph)))

(defn- ->int [id] (parse-long (name id)))

(defn- dejsonify-with [f m]
  (into {}
        (map (fn [[k v]]
               [(or (->int k) k) (f v)]))
        m))

(defn- dejsonify-id->permission-map [m]
  (dejsonify-with keyword m))

(defn- dejsonify-groups-map [m]
  (dejsonify-with dejsonify-id->permission-map m))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and
  parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-groups-map))

(api/defendpoint PUT "/global-graph"
  "Do a batch update of the global App Permissions by passing in a modified graph."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (-> body
      dejsonify-graph
      app.graph/update-global-graph!))

(api/defendpoint PUT "/graph"
  "Do a batch update of the advanced App Permissions by passing in a modified graph."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (let [update-graph! (resolve-advanced-app-permission-function 'update-graph!)]
    (-> body
        dejsonify-graph
        update-graph!)))

(api/define-routes)
