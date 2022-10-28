(ns metabase.api.app
  (:require
    [clojure.set :as set]
    [clojure.string :as str]
    [clojure.walk :as walk]
    [compojure.core :refer [POST PUT]]
    [honeysql.helpers :as hh]
    [medley.core :as m]
    [metabase.actions :as actions]
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

(defn- using-model-condition [model-id]
  (let [model-ref-condition
        [:or
         [:= :c.id model-id]
         [:like :c.dataset_query (format "%%card__%s%%" model-id)]
         [:like :c.dataset_query (format "%%#%s%%" model-id)]]]
    [:exists
     {:union-all [;; the model or a question (possibly) with the model in the app collection
                  {:select [0]
                   :from [[:report_card :c]]
                   :where [:and
                           [:= :c.collection_id :app.collection_id]
                           model-ref-condition]}
                  ;; the model or a question (possibly) with the model on a dashboard in the app collection
                  {:select [0]
                   :from [[:report_card :c]]
                   :join [[:report_dashboardcard :dc] [:= :dc.card_id :c.id]
                          [:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
                   :where [:and
                           [:= :d.collection_id :app.collection_id]
                           model-ref-condition]}]}]))

(api/defendpoint GET "/"
  "Fetch a list of all Apps that the current user has read permissions for.

  By default, this returns Apps with non-archived Collections, but instead you can show archived ones by passing
  `archived=true`. By specifying `using_model=<model-id>` the list can be restricted to the apps using the given
  model."
  [archived using_model]
  {archived    (s/maybe su/BooleanString)
   using_model (s/maybe su/IntStringGreaterThanZero)}
  (let [archived? (Boolean/parseBoolean archived)
        using-model (some-> using_model parse-long)
        candidates (db/select [App :app.*]
                     (cond-> {:left-join [:collection [:= :collection.id :app.collection_id]]
                              :where [:and
                                      [:= :collection.archived archived?]
                                      (-> @api/*current-user-permissions-set*
                                          collection/permissions-set->visible-collection-ids
                                          collection/visible-collection-ids->honeysql-filter-clause)]
                              :order-by [[:%lower.collection.name :asc]]}
                       using-model (hh/merge-where (using-model-condition using-model))))]
    (if using-model
      ;; make sure the returned apps really use the specified model
      (filter (fn [{:keys [models]}] (some #{using-model} (map :id models)))
              (hydrate-details candidates :models))
      (hydrate-details candidates))))

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

(defn- page-type-display
  []
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
     :display (get-in (page-type-display) ["model" :display])
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
          :actions (if (= page-type "list")
                     [["insert" (i18n/tru "New")]]
                     [["update" (i18n/tru "Edit")]
                      ["delete" (i18n/tru "Delete")]])
          :model-ref ["scaffold-target-id" "card" ident-type table-id "model"]
          :card-ref ["scaffold-target-id" "card" ident-type table-id "model" "card"]
          :page-name (format "%s %s"
                             (or (:display_name table) (:name table))
                             (get-in (page-type-display) [page-type :name]))})
       :models-to-create (generate-models table-ids table-id->table)})))

(defn- page-infos-from-model-ids
  [model-ids]
  (when (seq model-ids)
    (let [models (db/select Card :id [:in model-ids])
          model-id->model (m/index-by :id models)
          model-id->params (action/implicit-action-parameters models)
          model-actions (action/merged-model-action models :card_id [:in model-ids])
          model-id->model-actions (group-by :model_id model-actions)
          sorter (fn [slug]
                   (get {"update" 1 "delete" 2 "insert" 0} slug 3))
          action-mapper (fn [{:keys [slug name]}]
                          [slug (or name
                                    (get {"insert" (i18n/tru "New")
                                          "update" (i18n/tru "Edit")
                                          "delete" (i18n/tru "Delete")}
                                         slug))])]
      (for [model-id model-ids
            :let [model (get model-id->model model-id)
                  params (get model-id->params model-id)
                  pks (filter ::action/pk? params)
                  _ (when (not= 1 (count pks))
                      (throw (ex-info (i18n/tru "Model must have a single primary key: {0}" (:name model))
                                      {:status-code 400})))
                  pk-param (first pks)
                  pk-field-slug (:id pk-param)
                  model-action (get model-id->model-actions model-id)
                  ident-type "model"]
            page-type ["list" "detail"]
            :let [selector (if (= page-type "detail") :requires_pk (complement :requires_pk))
                  actions (->> model-action
                               (filter selector)
                               (map action-mapper)
                               (sort-by (comp sorter first)))]]
        {:page-type page-type
         :pk-field-slug pk-field-slug
         :pk-field-id (::action/field-id pk-param)
         :pk-field-name (:id pk-param)
         :page-ident model-id
         :ident-type ident-type
         :actions actions
         :model-ref model-id
         :card-ref (str "card__" model-id)
         :page-name (format "%s %s"
                            (:name model)
                            (get-in (page-type-display) [page-type :name]))}))))

(defn- generate-scaffold
  [app-name source-table-ids]
  (let [source-table-ids (distinct source-table-ids)
        table-ids (filter number? source-table-ids)
        extract-model-id #(if-let [[_ card-id] (and (string? %) (re-find #"^card__(\d+)$" %))]
                            (parse-long card-id)
                            %)
        model-ids (->> source-table-ids
                       (filter string?)
                       (map extract-model-id))
        page-sort (->> source-table-ids
                       (map (juxt #(if (string? %) "model" "table")
                                  extract-model-id))
                       m/indexed
                       (into {})
                       set/map-invert)
        {:keys [page-infos models-to-create]} (page-infos-and-models-from-table-ids table-ids)
        page-infos (->> (page-infos-from-model-ids model-ids)
                        (concat page-infos)
                        (sort-by (comp page-sort (juxt :ident-type :page-ident))))]
    {:app {:collection {:name app-name :color "#FFA500"}
           :dashboard_id ["scaffold-target-id" "page" (:ident-type (first page-infos)) (:page-ident (first page-infos)) "list"]
           :nav_items (for [{:keys [ident-type page-ident page-type]} page-infos]
                        (cond-> {:page_id ["scaffold-target-id" "page" ident-type page-ident page-type]}
                          (= page-type "detail") (assoc :indent 1 :hidden true)))}
     :cards (into (vec models-to-create)
                  (for [{:keys [page-name page-type ident-type page-ident card-ref]} page-infos]
                    {:scaffold-target ["card" ident-type page-ident page-type]
                     :name page-name
                     :display (get-in (page-type-display) [page-type :display])
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
                                    (seq actions)
                                    (concat
                                      (mapv (fn [[slug action-name] col]
                                              {:size_y 1 :size_x 2 :row 0 :col col
                                               :card_id model-ref
                                               :visualization_settings {"virtual_card" {"display" "action"}
                                                                        "button.label" action-name
                                                                        "action_slug" slug}})
                                            actions
                                            (range (- 18 (* 2 (count actions))) Long/MAX_VALUE 2))))
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

                                    (seq actions)
                                    (concat
                                      (mapv (fn [[slug action-name] col]
                                              {:size_y 1 :size_x 2 :row 0 :col col
                                               :card_id model-ref
                                               :parameter_mappings [{"parameter_id" (str "scaffold_" page-ident)
                                                                     "target" ["variable", ["template-tag", pk-field-slug]]}]
                                               :visualization_settings (cond-> {"virtual_card" {"display" "action"}
                                                                                "button.label" action-name
                                                                                "action_slug" slug}
                                                                         (= "delete" slug)
                                                                         (assoc "button.variant" "danger"))})
                                            actions
                                            (range (- 18 (* 2 (count actions))) Long/MAX_VALUE 2)))))}
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

(api/define-routes actions/+check-data-apps-enabled)
