(ns metabase.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Tables and Dashboards for
  each user."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.models.collection.root :as root]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as m]
   [next.jdbc :as jdbc]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(doto :model/RecentViews (derive :metabase/model))

(m/defmethod t2/table-name :model/RecentViews [_model] :recent_views)

(t2/define-before-insert :model/RecentViews
  [log-entry]
  (let [defaults {:timestamp :%now}]
    (merge defaults log-entry)))

(def ^:private ^:dynamic *recent-views-stored-per-user-per-model*
  "The number of recently viewed items to keep per user per model. This is used to keep the most recent views of each
  model type in [[models-of-interest]]."
  20)

(defn- duplicate-model-ids
  "Returns a set of IDs of duplicate models in the RecentViews table. Duplicate means that the same model and model_id
   shows up more than once. This returns the ids for the copies that are not the most recent entry."
  []
  (->> (t2/with-connection [^java.sql.Connection conn]
         (jdbc/execute! conn [(str/join "\n" ["SELECT id FROM"
                                              "   (SELECT id, row_number()"
                                              "     OVER (PARTITION BY model, model_id ORDER BY timestamp desc) AS rn"
                                              "     FROM recent_views) ranked"
                                              "WHERE rn != 1"])]))
       (map :recent_views/id)
       set))

(def ^:private models-of-interest
  "These are models for which we will retrieve recency."
  [:card :model :dashboard :table :collection])

(defn- ids-to-prune-for-user+model [user-id model]
  (t2/select-fn-set :id :model/RecentViews
                    {:select [:rv.id #_#_:rv.* [:rc.type :card_type]]
                     :from [[:recent_views :rv]]
                     :where [:and
                             [:= :rv.model (get {:model "card"} model (name model))]
                             [:= :rv.user_id user-id]
                             (when (#{:card :model} model)
                               [:= :rc.type (cond (= model :card) (h2x/literal "question")
                                                  (= model :model) (h2x/literal "model"))])]
                     :left-join [[:report_card :rc]
                                 [:and
                                  [:= :rc.id :rv.model_id]
                                  [:= :rv.model (h2x/literal "card")]]]
                     :order-by [[:rv.timestamp :desc]]
                     :offset *recent-views-stored-per-user-per-model*}))

(defn- ids-to-prune [user-id]
  (set/union
   (duplicate-model-ids)
   (->> models-of-interest
        (map #(ids-to-prune-for-user+model user-id %))
        (reduce into #{}))))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id  :- [:maybe ms/PositiveInt]
   model    :- [:or
                [:enum :model/Card :model/Table :model/Dashboard :model/Collection]
                :string]
   model-id :- ms/PositiveInt]
  (when user-id
    (span/with-span!
      {:name       "update-users-recent-views!"
       :attributes {:model/id   model-id
                    :user/id    user-id
                    :model/name (u/lower-case-en model)}}
      (t2/with-transaction [_conn]
        (t2/insert! :model/RecentViews {:user_id  user-id
                                        :model    (u/lower-case-en (name model))
                                        :model_id model-id})
        (let [ids-to-prune (ids-to-prune user-id)]
          (when (seq ids-to-prune)
            (t2/delete! :model/RecentViews :id [:in ids-to-prune])))))))

(defn most-recently-viewed-dashboard-id
  "Returns ID of the most recently viewed dashboard for a given user within the last 24 hours, or `nil`."
  [user-id]
  (t2/select-one-fn
   :model_id
   :model/RecentViews
   {:where    [:and
               [:= :user_id user-id]
               [:= :model (h2x/literal "dashboard")]
               [:> :timestamp (t/minus (t/zoned-date-time) (t/days 1))]]
    :order-by [[:id :desc]]}))

(def ^:private ^:dynamic *recent-views-stored-per-user* 30)

(defn user-recent-views
  "Returns the most recent `n` unique views for a given user."
  ([user-id]
   (user-recent-views user-id *recent-views-stored-per-user*))
  ([user-id n]
   (let [all-user-views (t2/select-fn-vec #(select-keys % [:model :model_id])
                                          :model/RecentViews
                                          :user_id user-id
                                          {:order-by [[:id :desc]]
                                           :limit    *recent-views-stored-per-user*})]
     (->> (distinct all-user-views)
          (take n)
          ;; Lower-case the model name, since that's what the FE expects
          (map #(update % :model u/lower-case-en))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; new stuff ;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;;interface RecentItem {
;;  id: number;
;;  name: string;
;;  model: string; // should differentiate between regular cards and "dataset" for models
;;  can_write: boolean;
;;  timestamp: string; // last touched
;;  display: string; // for cards
;;  parent_collection: { // for non-tables
;;    id: number;
;;    name: string;
;;    authority_level: "official" | null; // for collections
;;  } | null;
;;  database: { // for tables
;;    id: number;
;;    name: string; // display name
;;  } | null;
;;  authority_level: "official" | null; // for collections
;;  moderated_status: "verified" | null; // for models
;;}

(let [defaults [:map
                [:id [:int {:min 1}]]
                [:name :string]
                [:model [:enum :dataset :card :dashboard :collection :table]] ;; what is this exactly?
                [:can_write :boolean]
                [:timestamp :string]]
      defaults+ (fn [& kvs]
                  (-> (apply mu/map-schema-assoc defaults kvs)
                      (mut/assoc :parent_collection [:map
                                                     [:id [:or [:int {:min 1}] [:= "root"]]]
                                                     [:name :string]
                                                     [:authority_level [:enum "official" nil]]])
                      mut/closed-schema))]
  (def RecentItem
    [:multi {:dispatch :model}
     [:card (defaults+ :display :string)]
     [:dataset (defaults+ :moderated_status [:enum "verified" nil])]
     [:dashboard (defaults+)]
     [:table (-> (defaults+ :database [:map [:id [:int {:min 1}]] [:name {:note "display name"} :string]])
                 (mut/dissoc :parent_collection))]
     [:collection (defaults+ :authority_level [:enum "official" nil])]]))



(defmulti ^:private fill-recent-view-info
  "Fills in additional information for a recent view, such as the display name of the object."
  (fn [{:keys [model #_model_id #_timestamp]}]
    (keyword (if (= model :model) "dataset" model))))

(defmethod fill-recent-view-info :default [m] (throw (ex-info "Unknown model" {:model m})))

(defn get-parent-coll
  "Gets parent collection info for a recent view item."
  [coll-id-or-coll]
  (select-keys
   (cond (map? coll-id-or-coll) (if-let [parent-id (:parent_id (t2/hydrate coll-id-or-coll :parent_id))]
                                  ;; hydrate the effective location on the collection
                                  (t2/select-one :model/Collection parent-id)
                                  (root/root-collection-with-ui-details {}))
         (nil? coll-id-or-coll) (root/root-collection-with-ui-details {})
         :else (t2/select-one :model/Collection coll-id-or-coll))
   [:id :name :authority_level]))

(defmethod fill-recent-view-info :card [{:keys [_model model_id timestamp]}]
  (let [card (t2/select-one :model/Card model_id)]
    {:id model_id
     :name (:name card)
     :display (when-let [display (:display card)] (name display))
     :model :card
     :can_write (mi/can-write? :model/Card model_id)
     :timestamp (str timestamp)
     :parent_collection (get-parent-coll (:collection_id card))}))

(defmethod fill-recent-view-info :dataset [{:keys [_model model_id timestamp]}]
  (let [dataset (t2/select-one :model/Card model_id)]
    {:id model_id
     :name (:name dataset)
     :model :dataset
     :can_write (mi/can-write? :model/Card model_id)
     :timestamp (str timestamp)
     :parent_collection (get-parent-coll (:collection_id dataset))}))

(defmethod fill-recent-view-info :dashboard [{:keys [_model model_id timestamp]}]
  (let [dashboard (t2/select-one :model/Dashboard model_id)]
    {:id model_id
     :name (:name dashboard)
     :model :dashboard
     :can_write (mi/can-write? :model/Card model_id)
     :timestamp (str timestamp)
     :parent_collection (get-parent-coll (:collection_id dashboard))}))

(defmethod fill-recent-view-info :table [{:keys [_model model_id timestamp]}]
  (let [table (t2/select-one :model/Table model_id)]
    {:id model_id
     :name (:name table)
     :model :table
     :can_write (mi/can-write? :model/Table model_id)
     :timestamp (str timestamp)
     :database {:id (:database-id table)
                :name (:name table)}}))

(defmethod fill-recent-view-info :collection [{:keys [_model model_id timestamp]}]
  (let [collection (t2/select-one :model/Collection model_id)]
    {:id model_id
     :name (:name collection)
     :model :collection
     :can_write (mi/can-write? :model/Collection model_id)
     :timestamp (str timestamp)
     :authority_level (:authority_level collection)
     :parent_collection (get-parent-coll collection)}))

(mu/defn ^:private model->return-model [model :- :keyword]
  (if (#{:question} model) :card model))

(defn ^:private do-query [user-id]
  (t2/select :model/RecentViews {:select [:rv.* [:rc.type :card_type]]
                                 :from [[:recent_views :rv]]
                                 :where [:and [:= :rv.user_id user-id]]
                                 :left-join [[:report_card :rc]
                                             [:and
                                              ;; only want to join on card_type if it's a card
                                              [:= :rv.model "card"]
                                              [:= :rc.id :rv.model_id]]]
                                 :order-by [[:rv.timestamp :desc]]}))

(defn ^:private post-process [x]
  (-> x
      fill-recent-view-info
      (assoc :model (some-> (or (:card_type x) (:model x)) keyword))
      (dissoc :card_type)
      (update :model model->return-model)))

(defn get-views [user-id]
  (into [] (map post-process) (do-query user-id)))
