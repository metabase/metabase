(ns metabase.notification.payload.impl.system-event
  (:require
   [clojure.set :as set]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.appearance.core :as appearance]
   [metabase.channel.email.messages :as messages]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.table :as table]
   [metabase.models.user :as user]
   [metabase.notification.condition :as notification.condition]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.sample :as payload.sample]
   [metabase.notification.send :as notification.send]
   [metabase.session.core :as session]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(defn- join-url
  [user-id]
  ;; TODO: the reset token should come from the event-info, not generated here!
  (let [reset-token               (user/set-password-reset-token! user-id)
        should-link-to-login-page (and (sso/sso-enabled?)
                                       (not (session/enable-password-login)))]
    (if should-link-to-login-page
      (str (system/site-url) "/auth/login")
      ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
      (str (user/form-password-reset-url reset-token) "#new"))))

(defmulti transform-event-info
  "Transform the event info to a format that is easier to work with in the templates.
  This is a multi-method because we want to be able to add more event types in the future."
  {:arglists '([notification-info])}
  (comp :event_name :payload))

(defmulti event-info->condition-context
  "Transformed the published event info to an intermediate datastructure that's used for evaluating the condition"
  {:arglists '([event-topic event-info])}
  (fn [event-topic _event-info]
    event-topic))

(defmethod event-info->condition-context :default
  [_event-topic event-info]
  event-info)

(defn- sample-for-table
  [table-id changes?]
  (let [order-field    (t2/select-one-fn :field_order :model/Table table-id)
        ordered-fields (table/ordered-fields table-id order-field)]
    (apply ordered-map/ordered-map
           (mapcat (fn [field]
                     [(:name field) (if changes?
                                      {:before (payload.sample/sample-field field)
                                       :after  (payload.sample/sample-field field)}
                                      (payload.sample/sample-field field))])
                   ordered-fields))))

(def ^:private timestamp-schema
  [:timestamp {:gen/fmap (fn [_x] (u.date/format (t/zoned-date-time)))} :any])

(def ^:private scope-schema
  [:scope [:map {:gen/return {:type       "dashboard"
                              :origin_url (urls/dashboard-url 1337)}}
           [:type :keyword]
           [:origin_url :string]]])

(def ^{:dynamic true
       :doc "Dynamic variable used to control the value of sampling example for row schema"}
  *sample-table-id* nil)

(mr/def ::row.mutate
  [:map {:closed true}
   [:context :map]
   [:creator [:map {:gen/return {:first_name  "Meta"
                                 :last_name   "Bot"
                                 :common_name "Meta Bot"
                                 :email       "bot@metabase.com"}}
              [:first_name [:maybe :string]]
              [:last_name [:maybe :string]]
              [:email :string]
              [:common_name [:maybe :string]]]]
   [:editor [:map {:gen/return {:first_name  "Meta"
                                :last_name   "Bot"
                                :common_name "Meta Bot"
                                :email       "bot@metabase.com"}}
             [:first_name [:maybe :string]]
             [:last_name [:maybe :string]]
             [:email :string]
             [:common_name [:maybe :string]]]]
   [:table [:map {:closed   true
                  :gen/fmap (fn [_x]
                              (if *sample-table-id*
                                (let [{:keys [name db_id]} (t2/select-one [:model/Table :name :db_id] *sample-table-id*)]
                                  {:id  *sample-table-id*
                                   :name name
                                   :url  (urls/table-url db_id *sample-table-id*)})
                                {:id    1
                                 :name "orders"
                                 :url  (urls/table-url 1337 1)}))}
            [:id :int]
            [:name :string]
            [:url :string]]]
   [:settings [:map]]])

;; TODO: all 3 schemas are actually the same, we should be able to use a multi schema for this.
;; the reason we need to separte them out is to have description and sampling nicer.
;; Maybe we should figure out a way to provide options for choosing the value of dispatch when sampling
;; Looked but afaik there is no such things. (PR against malli?)
(mr/def ::row.created
  [:merge
   ::row.mutate
   [:map
    [:context [:map {:closed true}
               [:event_name [:enum :event/row.created "event/row.created"]]
               timestamp-schema
               scope-schema]]
    [:record {:description "The newly created row with all its field values"
              :gen/fmap    (fn [_]
                             (if *sample-table-id*
                               (sample-for-table *sample-table-id* false)
                               {:id     1
                                :name   "Product A"
                                :price  29.99
                                :status "active"}))}
     :map]]])

(mr/def ::row.updated
  [:merge
   ::row.mutate
   [:map
    [:context [:map {:closed true}
               [:event_name [:enum :event/row.updated "event/row.updated"]]
               timestamp-schema
               scope-schema]]
    [:record {:description "The row after updates were applied, containing all fields"
              :gen/fmap    (fn [_]
                             (if *sample-table-id*
                               (sample-for-table *sample-table-id* false)
                               {:id     1
                                :name   "Product A"
                                :price  24.99
                                :status "on sale"}))}
     :map]
    [:changes {:description "Only the fields that were modified, showing previous and new values"
               :gen/fmap    (fn [_]
                              (if *sample-table-id*
                                (sample-for-table *sample-table-id* true)
                                {:price  {:before 29.99
                                          :after 24.99}
                                 :status {:before "active"
                                          :after "on sale"}}))}
     [:map-of :string [:map
                       [:before :any]
                       [:after :any]]]]]])

(mr/def ::row.deleted
  [:merge
   ::row.mutate
   [:map {:closed true}
    [:context [:map {:closed true}
               [:event_name [:enum :event/row.deleted "event/row.deleted"]]
               timestamp-schema
               scope-schema]]
    [:record {:description "The row that was deleted, showing all field values before deletion"
              :gen/fmap    (fn [_]
                             (if *sample-table-id*
                               (sample-for-table *sample-table-id* false)
                               {:id     1
                                :name   "Product A"
                                :price  24.99
                                :status "on sale"}))}
     :map]]])

(defn- coercion-fn
  [{:keys [coercion_strategy] :as field}]
  #_{:clj-kondo/ignore [:metabase/modules]}
  (let [f (if-let [f (requiring-resolve 'metabase-enterprise.data-editing.coerce/coercion-fns)]
            (or (:out (get @f coercion_strategy)) identity)
            identity)]
    (fn [v]
      (try
        (f v)
        (catch Exception e
          (log/warnf e "Failed to coercing value of field %d with value %s" (:id field) v)
          v)))))

(defn- apply-coercion
  [v field]
  (if-let [f (coercion-fn field)]
    (some-> v f)
    v))

(defn- normalize-record
  [record ordered-fields changes-record?]
  (let [col->field (merge (u/for-map [f ordered-fields]
                            [(u/lower-case-en (:name f)) f])
                          (u/for-map [f ordered-fields]
                            [(u/upper-case-en (:name f)) f])
                          (zipmap (mapv :name ordered-fields) ordered-fields))
        ;; column name in the original record might not have the correct casing for column name
        ;; so we're trying to fix it here
        record     (-> record
                       (update-keys u/qualified-name)
                       (update-keys (comp :name col->field)))]
    ;; make sure we apply proper coercion
    (u/for-map [[k v] record]
      [k (if changes-record?
           (-> v
               (update :before apply-coercion (get col->field k))
               (update :after apply-coercion (get col->field k)))
           (apply-coercion v (get col->field k)))])))

(defn- normalized-record-map
  "Do several things:
  - Turn record into a ordered-map that follows table's field_order property.
  - Transform each value properly."
  [record ordered-fields changes-record?]
  (when-let [record (normalize-record record ordered-fields changes-record?)]
    (apply ordered-map/ordered-map
           (mapcat (fn [field-name]
                     (when-let [v (get record field-name)]
                       [field-name v]))
                   (mapv :name ordered-fields)))))

(mr/def ::row.mutate.all
  [:multi {:dispatch (comp :event_name :context)}
   [:event/row.created ::row.created]
   [:event/row.updated ::row.updated]
   [:event/row.deleted ::row.deleted]])

(defn- scope->origin-url
  [{:keys [dashboard_id database_id table_id] :as scope}]
  (case (:type scope)
    (:dashcard :dashboard) (urls/dashboard-url dashboard_id)
    (urls/table-url database_id table_id)))

(mu/defn- bulk-row-transformation :- ::row.mutate.all
  [notification-info]
  (or (lib.util.match/match-one
        notification-info
        {:payload    {:event_name ?event_name}
         :creator    ?creator
         :event_info {:actor       ?actor
                      :scope       ?scope
                      :args        {:table_id  ?table_id
                                    :db_id     ?db_id
                                    :table     {:name ?table_name
                                                :field_order ?field_order}
                                    :timestamp ?timestamp}
                      :row_change  {:pk     ?pk
                                    :before ?before
                                    :after  ?after}}}
        (let [ordered-fields (table/ordered-fields ?table_id ?field_order)]
          (merge
           {:context  {:event_name ?event_name
                       :timestamp  (u.date/format ?timestamp)
                       :scope      {:type       (:type ?scope)
                                    :origin_url (scope->origin-url ?scope)}}
            :editor   (select-keys ?actor [:first_name :last_name :email :common_name])
            :creator  (select-keys ?creator [:first_name :last_name :email :common_name])
            :table    {:id   ?table_id
                       :name ?table_name
                       :url  (urls/table-url ?db_id ?table_id)}
            :record   (normalized-record-map (or ?after ?before) ordered-fields false) ;; for insert and update we want the after, for delete we want the before
            :settings (notification.payload/default-settings)}
           (when (= ?event_name :event/row.updated)
             {:changes (let [changed-columns (->> (set/union (set (keys ?before)) (set (keys ?after)))
                                                  (filter #(not= (get ?before %) (get ?after %)))
                                                  (into #{}))]
                         (normalized-record-map
                          (into {}
                                (for [k changed-columns]
                                  [k {:before (get ?before k)
                                      :after  (get ?after k)}]))
                          ordered-fields
                          true))}))))
      (throw (ex-info "Unable to destructure notification-info, check that expected structure matches malli schema."
                      {:notification-info notification-info}))))

(mu/defmethod transform-event-info :event/row.created :- ::row.created
  [notification-info]
  (bulk-row-transformation notification-info))

(mu/defmethod transform-event-info :event/row.updated :- ::row.updated
  [notification-info]
  (bulk-row-transformation notification-info))

(mu/defmethod transform-event-info :event/row.deleted :- ::row.deleted
  [notification-info]
  (bulk-row-transformation notification-info))

(defmethod transform-event-info :default
  [notification-info]
  (let [event-info (:event_info notification-info)]
    {:creator      (t2/select-one [:model/User :id :first_name :last_name :email] (:creator_id notification-info))
     :context      (notification.payload/default-settings)
     ;; TODO, we need event_name anywhere?
     :payload      (assoc event-info :event_name (-> notification-info :payload :event_name))}))

(defmethod transform-event-info :event/user-invited
  [notification-info]
  (let [default-payload ((get-method transform-event-info :default) notification-info)]
    (assoc-in default-payload
              [:payload :custom]
              {:user_invited_email_subject (trs "You''re invited to join {0}''s {1}" (appearance/site-name) (messages/app-name-trs))
               :user_invited_join_url      (-> notification-info :event_info :object :id join-url)})))

(mu/defmethod notification.payload/notification-payload :notification/system-event :- :map
  [notification-info :- ::notification.payload/Notification]
  (transform-event-info notification-info))

(defmethod notification.payload/notification-payload-schema :notification/system-event
  [notification-info]
  (when-let [[op _arg-schema return-schema] (some->> notification-info
                                                     :payload
                                                     :event_name
                                                     (get-method transform-event-info)
                                                     meta
                                                     :schema)]
    (assert (= op :=>))
    (mr/resolve-schema return-schema)))

(defn- default-row-action-transformation
  [event-topic event-info]
  (lib.util.match/match-one
    event-info
    {:row_change {:before ?before
                  :after  ?after}
     :args       {:table_id ?table-id}}
    {:record     (or ?after ?before)
     :table_id   ?table-id
     :event_name event-topic}))

(mr/def ::condition.row.mutated
  [:map {:closed true}
   [:record :map]
   [:table_id pos-int?]
   [:event_name :keyword]])

(mu/defmethod event-info->condition-context :event/row.created :- ::condition.row.mutated
  [event-topic event-info]
  (default-row-action-transformation event-topic event-info))

(mu/defmethod event-info->condition-context :event/row.updated :- ::condition.row.mutated
  [event-topic event-info]
  (default-row-action-transformation event-topic event-info))

(mu/defmethod event-info->condition-context :event/row.deleted :- ::condition.row.mutated
  [event-topic event-info]
  (default-row-action-transformation event-topic event-info))

(defmethod notification.send/should-queue-notification? :notification/system-event
  [notification-info]
  (if-let [condition (not-empty (:condition notification-info))]
    (->> (event-info->condition-context (get-in notification-info [:payload :event_name]) (:event_info notification-info))
         (notification.condition/evaluate-expression condition))
    true))

(defn sample-payload
  "Generate sample payload for a system event notification"
  [notification]
  (binding [*sample-table-id* (get-in notification [:payload :table_id])]
    (mu/generate-example (notification.payload/notification-payload-schema notification))))
