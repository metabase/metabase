(ns metabase.api.app
  (:require
    [clojure.string :as str]
    [clojure.walk :as walk]
    [compojure.core :refer [POST PUT]]
    [medley.core :as m]
    [metabase.api.card :as api.card]
    [metabase.api.collection :as api.collection]
    [metabase.api.common :as api]
    [metabase.models :refer [App Collection Dashboard Table]]
    [metabase.models.app.graph :as graph]
    [metabase.models.collection :as collection]
    [metabase.models.dashboard :as dashboard]
    [metabase.util.i18n :as i18n]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(defn- hydrate-details [apps]
  (hydrate apps [:collection :can_write]))

(defn- create-app! [{:keys [collection] :as app}]
  (db/transaction
   (let [coll-params (select-keys collection [:name :color :description :namespace :authority_level])
         collection-instance (api.collection/create-collection! coll-params)
         app-params (-> app
                        (select-keys [:dashboard_id :options :nav_items])
                        (assoc :collection_id (:id collection-instance)))
         app (db/insert! App app-params)]
     (graph/set-default-permissions! app)
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
  (api/write-check Collection (db/select-one-field :collection_id App :id app-id))
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
  (hydrate-details (api/read-check App id)))

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
                                                                      (assoc :collection_id collection-id)
                                                                      (dissoc :scaffold-target)))]
                                  (assoc accum (into ["scaffold-target-id"] scaffold-target) (:id card))))
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

(defn- generate-scaffold
  [app-name table-ids]
  (let [table-ids (distinct table-ids)
        tables (hydrate (db/select Table :id [:in table-ids]) :fields)
        _ (when (not= (count table-ids) (count tables))
            (throw (ex-info (i18n/tru "Some tables could not be found. Given: {0} Found: {1}"
                                      (pr-str table-ids)
                                      (pr-str (map :id tables)))
                            {:status-code 400})))
        table-id->table (m/index-by :id tables)
        page-type-display {"list" {:name (i18n/tru "List")
                                   :display "list"}
                           "detail" {:name (i18n/tru "Detail")
                                     :display "object"}}]
    {:app {:collection {:name app-name :color "#FFA500"}
           :dashboard_id ["scaffold-target-id" "page" (:id (first tables)) "list"]
           :nav_items (for [table-id table-ids
                            page-type ["list" "detail"]]
                        (cond-> {:page_id ["scaffold-target-id" "page" table-id page-type]}
                          (= page-type "detail") (assoc :indent 1 :hidden true)))}
     :cards (for [table-id table-ids
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
                                               :field-id)]
                  page-type ["list" "detail"]]
              {:scaffold-target ["card" table-id page-type]
               :name (format "Query %s %s"
                             (or (:display_name table) (:name table))
                             (get-in page-type-display [page-type :name]))
               :display (get-in page-type-display [page-type :display])
               :visualization_settings (cond-> {}
                                         (= page-type "list") (assoc "actions.bulk_enabled" false))
               :dataset_query {:type "query"
                               :database (:db_id table)
                               :query (cond-> {:source_table table-id}
                                        order-by-field-id (assoc :order_by [["desc", ["field", order-by-field-id, nil]]]))}})
     :pages (for [table-id table-ids
                  :let [table (get table-id->table table-id)
                        pks (filter (comp #(= :type/PK %) :semantic_type) (:fields table))
                        _ (when (not= 1 (count pks))
                            (throw (ex-info (i18n/tru "Table must have a single primary key: {0}" (:name table))
                                            {:status-code 400})))
                        pk-field-id (:id (first pks))]
                  page-type ["list" "detail"]]
              (cond->
               {:name (format "%s %s"
                              (or (:display_name table) (:name table))
                              (get-in page-type-display [page-type :name]))
                :scaffold-target ["page" table-id page-type]
                :ordered_cards (if (= "list" page-type)
                                 [{:size_y 8 :size_x 18 :row 1 :col 0
                                   :card_id ["scaffold-target-id" "card" table-id page-type]
                                   :visualization_settings {"click_behavior"
                                                            {"type" "link"
                                                             "linkType" "page"
                                                             "parameterMapping" {(str "scaffold_" table-id) {"source" {"type" "column",
                                                                                                                       "id" "ID",
                                                                                                                       "name" "ID"},
                                                                                                             "target" {"type" "parameter",
                                                                                                                       "id" (str "scaffold_" table-id)},
                                                                                                             "id" (str "scaffold_" table-id)}}
                                                             "targetId" ["scaffold-target-id" "page" table-id "detail"]}}}
                                  {:size_y 1 :size_x 2 :row 0 :col 16
                                   :visualization_settings {"virtual_card" {"display" "action"}
                                                            "button.label" (i18n/tru "New"),
                                                            "click_behavior" {"type" "action" "actionType" "insert" "tableId" table-id}}}]
                                 [{:size_y 8 :size_x 18 :row 1 :col 0
                                   :parameter_mappings [{"parameter_id" (str "scaffold_" table-id)
                                                         "card_id" ["scaffold-target-id" "card" table-id "detail"]
                                                         "target" ["dimension", ["field", pk-field-id, nil]]}]
                                   :card_id ["scaffold-target-id" "card" table-id "detail"]
                                   :scaffold-target ["dashcard" table-id]}
                                  {:size_y 1 :size_x 2 :row 0 :col 0
                                   :visualization_settings {"virtual_card" {"display" "action"}
                                                            "button.label" (i18n/tru "← Back to list"),
                                                            "click_behavior" {"type" "link" "linkType" "page" "targetId" ["scaffold-target-id" "page" table-id "list"]}}}
                                  {:size_y 1 :size_x 2 :row 0 :col 16
                                   :visualization_settings {"virtual_card" {"display" "action"}
                                                            "button.label" (i18n/tru "Delete"),
                                                            "button.variant" "danger"
                                                            "click_behavior" {"type" "action" "actionType" "delete" "objectDetailDashCardId" ["scaffold-target-id" "dashcard" table-id]}}}
                                  {:size_y 1 :size_x 2 :row 0 :col 14
                                   :visualization_settings {"virtual_card" {"display" "action"}
                                                            "button.label" (i18n/tru "Edit"),
                                                            "click_behavior" {"type" "action" "actionType" "update" "objectDetailDashCardId" ["scaffold-target-id" "dashcard" table-id]}}}])}
                (= "detail" page-type) (assoc :parameters [{:name "ID",
                                                            :slug "id",
                                                            :id (str "scaffold_" table-id),
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
  (graph/global-graph))

(defn- ->int [id] (Integer/parseInt (name id)))

(defn- dejsonify-id->permission-map [m]
  (into {}
        (map (fn [[k v]]
               [(->int k) (keyword v)]))
        m))

(defn- dejsonify-global-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"none\"` to `:none` and
  parsing object keys as integers."
  [graph]
  (update graph :groups dejsonify-id->permission-map))

(api/defendpoint PUT "/global-graph"
  "Do a batch update of the global App Permissions by passing in a modified graph."
  [:as {body :body}]
  {body su/Map}
  (api/check-superuser)
  (-> body
      dejsonify-global-graph
      graph/update-global-graph!)
  (graph/global-graph))

(api/define-routes)
