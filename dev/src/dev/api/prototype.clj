(ns dev.api.prototype
  (:require [honey.sql.helpers :as sql.helpers]
            [metabase.api.common :as api]
            [metabase.api.macros :as api.macros]
            [metabase.app-db.core :as mdb]
            [metabase.util.json :as json]
            [metabase.util.log :as log]
            [metabase.util.malli.schema :as ms]
            [toucan2.core :as t2]))

(defn- create-table-query []
  (let [columns (cond
                  (= :postgres (mdb/db-type)) [[:id :serial [:primary-key]]
                                               [:type [:varchar 255] [:not nil]]
                                               [:content :text [:not nil]]]
                  (= :mysql (mdb/db-type)) [[:id :bigint [:primary-key] [:auto-increment]]
                                            [:type [:varchar 255] [:not nil]]
                                            [:content :text [:not nil]]]
                  (= :h2 (mdb/db-type)) [[:id :identity [:primary-key]]
                                         [:type [:varchar 255] [:not nil]]
                                         [:content :text [:not nil]]]
                  :else (throw (ex-info "Unsupported database type for prototype_data table" {:db-type (mdb/db-type)})))]
    (-> (sql.helpers/create-table :dev_prototype_data :if-not-exists)
        (sql.helpers/with-columns
          columns))))

(def ^:private create-table! (mdb/memoize-for-application-db
                              (fn []
                                (log/info "Creating prototype_data table if it does not exist")
                                (t2/query (create-table-query))
                                :dev_prototype_data)))

(defn- prototype-table
  "Creates the prototype table if it does not exist"
  [] (create-table!))

(defn- row->json [row]
  (assoc (json/decode (:content row)) :id (:id row)))

(api.macros/defendpoint :get "/:type/"
  "Gets all records of the given type.
  Any parameters passed will be used for equals filters"
  [{:keys [type]} :- [:map [:type ms/NonBlankString]]
   query-args]
  (filter (fn [obj]
            (every? (fn [[query-k query-v]]
                      (let [obj-v (get obj (name query-k))]
                        (= query-v (str obj-v))))
                    query-args))
          (map row->json (t2/query {:select   [:id :content]
                                    :from     [(prototype-table)]
                                    :where    [:= :type type]
                                    :order-by [[:id :asc]]}))))

(api.macros/defendpoint :get "/:type/:id"
  "Returns an existing record"
  [{:keys [type id]} :- [:map
                         [:type ms/NonBlankString]
                         [:id ms/PositiveInt]]]
  (-> (api/check-404 (t2/query-one {:select [:id :content]
                                    :from   [(prototype-table)]
                                    :where  [:= :id id]}))
      (api/check-404)
      (row->json)))

(api.macros/defendpoint :post "/:type/"
  "Create a new record."
  [{:keys [type]} :- [:map
                      [:type ms/NonBlankString]]
   _query-params
   body]
  (let [id (t2/insert-returning-pk! (prototype-table)
                                    {:type    type
                                     :content (json/encode body)})]
    (assoc body :id id)))

(api.macros/defendpoint :put "/:type/:id"
  "Updates an existing record."
  [{:keys [type id]} :- [:map
                         [:type ms/NonBlankString]
                         [:id ms/PositiveInt]]
   _query-params
   body]
  (t2/update! (prototype-table) id
              {:type    type
               :content (json/encode body)})
  (assoc body :id id))

(api.macros/defendpoint :delete "/:type/:id"
  "Deletes an existing record."
  [{:keys [type id]} :- [:map
                         [:type ms/NonBlankString]
                         [:id ms/PositiveInt]]
   _query-params
   body]
  (api/check-404 (t2/delete! (prototype-table) id))

  {:id id})

(api.macros/defendpoint :delete "/:type/all"
  "Deletes all records of this type. Helpful for resetting to a clean state."
  [{:keys [type]} :- [:map
                      [:type ms/NonBlankString]]
   _query-params
   body]
  (t2/delete! (prototype-table) :type type)

  {:message "All records deleted" :type type})
