(ns metabase.prototype.filter-usage-seed
  "Prototype: saved questions that filter the prototype dataset, so that the \"Frequently used\" section of the filter
  picker has data on a new instance. See [[metabase.prototype.filter-usage]].

  The questions need an admin as their creator, so Metabase adds them at startup when an admin exists, and after the
  setup. When you change the questions, increment [[version]]. Prototype: an update adds only the questions with new
  names; it does not change or remove the existing ones."
  (:require
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.queries.core :as queries]
   [metabase.request.core :as request]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [methodical.core :as methodical]))

(def version
  "Version of the questions. Increment it to make existing instances add the new questions on their next start."
  1)

(def ^:private collection-name "Frequently used filters")

(defn- questions
  "Question definitions: `[name display source-table (fn [query field] query)]`. `field` gives the metadata of a
  column by table name and column name."
  []
  [["Customers on Pro plan" :table "customers"
    (fn [q field] (lib/filter q (lib/= (field "customers" "plan") "Pro")))]
   ["Active US customers" :table "customers"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "customers" "country") "US"))
                      (lib/filter (lib/= (field "customers" "status") "active"))))]
   ["Enterprise customers by country" :bar "customers"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "customers" "plan") "Enterprise"))
                      (lib/aggregate (lib/count))
                      (lib/breakout (field "customers" "country"))))]
   ["Churned customers" :table "customers"
    (fn [q field] (lib/filter q (lib/not-null (field "customers" "churned_at"))))]
   ["German customers by plan" :bar "customers"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "customers" "country") "DE"))
                      (lib/aggregate (lib/count))
                      (lib/breakout (field "customers" "plan"))))]
   ["Free plan signups this year" :table "customers"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "customers" "plan") "Free"))
                      (lib/filter (lib/time-interval (field "customers" "signed_up_at") :current :year))))]
   ["Verified active customers" :table "customers"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "customers" "is_verified") true))
                      (lib/filter (lib/= (field "customers" "status") "active"))))]
   ["Customers per state" :bar "customers"
    (fn [q field] (-> q
                      (lib/aggregate (lib/count))
                      (lib/breakout (field "customers" "state"))))]
   ["Customers in the West region" :table "customers"
    (fn [q field]
      (let [join-alias "US States"]
        (-> q
            (lib/join (-> (lib/join-clause (lib.metadata/table q (:table-id (field "us_states" "code")))
                                           [(lib/= (field "customers" "state")
                                                   (lib/with-join-alias (field "us_states" "code") join-alias))])
                          (lib/with-join-alias join-alias)
                          (lib/with-join-fields :none)))
            (lib/filter (lib/= (lib/with-join-alias (field "us_states" "region") join-alias) "West"))
            (lib/filter (lib/= (field "customers" "plan") "Pro")))))]
   ["Electronics products" :table "products"
    (fn [q field] (lib/filter q (lib/= (field "products" "category") "Electronics")))]
   ["Cheap electronics" :table "products"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "products" "category") "Electronics"))
                      (lib/filter (lib/< (field "products" "price") 50))))]
   ["Top rated products by category" :bar "products"
    (fn [q field] (-> q
                      (lib/filter (lib/>= (field "products" "rating") 4.5))
                      (lib/aggregate (lib/count))
                      (lib/breakout (field "products" "category"))))]
   ["Featured products" :table "products"
    (fn [q field] (lib/filter q (lib/= (field "products" "is_featured") true)))]
   ["Average price by brand" :bar "products"
    (fn [q field] (-> q
                      (lib/aggregate (lib/avg (field "products" "price")))
                      (lib/breakout (field "products" "brand"))))]
   ["Open flagship stores" :table "stores"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "stores" "is_open") true))
                      (lib/filter (lib/= (field "stores" "store_type") "Flagship"))))]
   ["Stores in California" :table "stores"
    (fn [q field] (lib/filter q (lib/= (field "stores" "state") "CA")))]
   ["Open stores by state" :bar "stores"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "stores" "is_open") true))
                      (lib/aggregate (lib/count))
                      (lib/breakout (field "stores" "state"))))]
   ["European countries" :table "countries"
    (fn [q field] (lib/filter q (lib/= (field "countries" "continent") "Europe")))]
   ["EU members by happiness" :table "countries"
    (fn [q field] (-> q
                      (lib/filter (lib/= (field "countries" "is_eu_member") true))
                      (lib/order-by (field "countries" "happiness_score") :desc)))]
   ["States in the South" :table "us_states"
    (fn [q field] (lib/filter q (lib/= (field "us_states" "region") "South")))]])

(defn- field-fn [mp table-ids]
  (let [ids (memoize #(prototype.db/field-ids-by-name (get table-ids %)))]
    (fn [table-name field-name]
      (lib.metadata/field mp (or (get (ids table-name) field-name)
                                 (throw (ex-info "Unknown prototype field" {:table table-name :field field-name})))))))

(defn- ensure-collection! []
  (or (prototype.db/root-collection-id-by-name collection-name)
      (:id (collections/create-collection! {:name collection-name}))))

(defn- seed! [database-id admin-id]
  (let [mp            (lib-be/application-database-metadata-provider database-id)
        table-ids     (prototype.db/table-ids-by-name database-id dataset/schema-name)
        field         (field-fn mp table-ids)
        collection-id (ensure-collection!)
        existing      (set (prototype.db/card-names-in-collection collection-id))]
    (doseq [[card-name display table-name query-fn] (questions)
            :when (not (existing card-name))
            :let  [query (query-fn (lib/query mp (lib.metadata/table mp (get table-ids table-name))) field)]]
      (queries/create-card! {:name                   card-name
                             :display                display
                             :dataset_query          query
                             :visualization_settings {}
                             :collection_id          collection-id}
                            {:id admin-id}))))

(defn ensure-questions!
  "Add the questions when they are out of date. Does nothing when there is no prototype Database or no admin yet."
  []
  (let [database-id (prototype.db/prototype-database-id)
        admin-id    (prototype.db/first-admin-id)]
    (when (and database-id admin-id
               (< (or (prototype.settings/prototype-filter-usage-seed-version) 0) version))
      (log/info "Prototype data: adding the filter usage questions")
      (request/with-current-user admin-id
        (seed! database-id admin-id))
      (prototype.settings/prototype-filter-usage-seed-version! version)
      (log/info "Prototype data: filter usage questions ready"))))

(events/derive! ::user-joined :metabase/event)
(events/derive! :event/user-joined ::user-joined)

(methodical/defmethod events/publish-event! ::user-joined
  "The questions need an admin, so add them after the setup makes the first one."
  [_topic _event]
  (quick-task/submit-task!
   (fn []
     (try
       (ensure-questions!)
       (catch Throwable e
         (log/error e "Prototype data: the filter usage questions failed"))))))
