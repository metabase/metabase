(ns dev.api.prototype
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.api.common :as api]
            [metabase.api.macros :as api.macros]
            [metabase.app-db.core :as mdb]
            [metabase.util.json :as json]
            [metabase.util.log :as log]
            [metabase.util.malli.schema :as ms]
            [toucan2.core :as t2]))

(def ^:private create-table! (mdb/memoize-for-application-db
                              (fn []
                                (log/info "Creating prototype_data table if it does not exist")
                                (t2/with-connection [conn]
                                  (jdbc/execute! {:connection conn}
                                                 "create table if not exists dev_prototype_data (
                                       id serial primary key,
                                       type varchar(255) not null,
                                       content text not null
                                     )"))
                                :dev_prototype_data)))

(defn- prototype-table
  "Creates the prototype table if it does not exist"
  [] (create-table!))

(defn- row->json [row]
  (assoc (json/decode (:content row)) :id (:id row)))

(api.macros/defendpoint :get "/:type/"
  "Gets all records of the given type.
  Any parameters passed will be used for equals filters"
  [{:keys [type]}
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
