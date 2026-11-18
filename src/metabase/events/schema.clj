(ns metabase.events.schema
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; TODO -- move these into appropriate modules.

(defonce ^:private lifecycle-topics
  (atom #{}))

(mu/defn event-schema
  "Get the Malli schema we should use for events of `topic`. By default, this looks in our registry for a schema
  matching the event topic name; if it fails to find one, it falls back to `:map`."
  [topic :- keyword?]
  (or (mr/registered-schema topic)
      (when (contains? @lifecycle-topics topic)
        ::lifecycle)
      :map))

(defn with-hydrate
  "Given a malli entry schema of a map, return a new entry schema with an additional option
  to hydrate information when sending system event notifications.

    (events.notification/hydrate! [:map
                                    (-> [:user_id :int] (with-hydrate :user [:model/User :email]))]
                                  {:user_id 1})
    ;; => {:user_id 1
           :user    {:email \"ngoc@metabase.com\"}}"
  [entry-schema k model]
  (assert (#{2 3} (count entry-schema)) "entry-schema must have 2 or 3 elements")
  (let [[entry-key option schema] (if (= 2 (count entry-schema))
                                    [(first entry-schema) {} (second entry-schema)]
                                    entry-schema)]
    [entry-key (assoc option :hydrate {:key   k
                                       :model model})
     schema]))

;; collection events

(mr/def :event/collection-read
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object   [:fn #(t2/instance-of? :model/Collection %)]]])

;; dashboard events

(mr/def :event/dashboard-read
  [:map {:closed true}
   [:user-id   [:maybe pos-int?]]
   [:object-id [:maybe pos-int?]]])

;; user events

(mr/def ::user
  [:map {:closed true}
   [:user-id pos-int?]])

(mr/def :event/user-login  ::user)
(mr/def :event/user-joined ::user)

(mr/def :event/user-invited
  [:map {:closed true}
   [:object [:map
             [:email ms/Email]
             [:is_from_setup {:optional true} :boolean]
             [:first_name    {:optional true} [:maybe :string]]
             [:invite_method {:optional true} :string]
             [:invite_target {:optional true}
              [:map
               [:type [:enum "dashboard" "question"]]
               [:id   ms/PositiveInt]
               [:name ms/NonBlankString]]]
             [:sso_source    {:optional true} [:maybe [:or :keyword :string]]]]]
   [:details {:optional true}
    [:map {:closed true}
     [:invitor [:map {:closed true}
                [:email                       ms/Email]
                [:first_name {:optional true} [:maybe :string]]]]]]])

;; session events

(mr/def :event/session-revoked
  [:map {:closed true}
   ;; the admin who revoked, and the user whose sessions they were. `:model` is passed explicitly because the object is
   ;; a plain map rather than a Toucan instance, so the audit log cannot derive it.
   [:user-id  pos-int?]
   [:model    [:= :model/User]]
   [:model-id pos-int?]
   ;; one per-user row of a revoke by criteria: the criteria and how many of that user's sessions went, which the
   ;; `:event/sessions-revoked` summary covers
   [:details
    [:map {:closed true}
     [:criteria :map]
     [:count    pos-int?]]]])

(mr/def :event/sessions-revoked
  ;; the one summary row a revoke by criteria writes. No `:model`: the call is about a set of sessions picked out by
  ;; criteria, not about any one object.
  [:map {:closed true}
   [:user-id pos-int?]
   [:details [:map {:closed true}
              [:criteria  :map]
              [:count     ms/IntGreaterThanOrEqualToZero]
              [:remaining ms/IntGreaterThanOrEqualToZero]]]])

;; table events

(mr/def :event/table-read
  [:map {:closed true}
   [:user-id  pos-int?]
   [:object [:fn #(t2/instance-of? :model/Table %)]]])

(mr/def ::permission-failure
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:object [:maybe [:fn #(boolean (t2/model %))]]]
   [:has-access {:optional true} [:maybe :boolean]]])

(mr/def :event/read-permission-failure   ::permission-failure)
(mr/def :event/write-permission-failure  ::permission-failure)
(mr/def :event/update-permission-failure ::permission-failure)

(mr/def :event/create-permission-failure
  [:map {:closed true}
   [:user-id [:maybe pos-int?]]
   [:model [:or :keyword :string]]])

;; Enterprise remote sync events

(mr/def :event/remote-sync
  [:map
   [:sync-type [:enum :initial :incremental :full "import" "export"]]
   [:collection-id [:maybe ms/NonBlankString]]
   [:user-id [:maybe pos-int?]]
   [:timestamp [:maybe :any]]
   [:branch {:optional true} [:maybe :string]]
   [:status {:optional true} [:maybe [:enum "success" "error"]]]
   [:version {:optional true} :string]
   [:message {:optional true} [:maybe :string]]])

;; security advisory events

(mr/def :event/security-advisory-match
  [:map {:closed true}
   [:object [:fn #(t2/instance-of? :model/SecurityAdvisory %)]]])

(defn register-lifecycle-topic!
  "Have the events of `topic`, one made by the write of a row, checked against the lifecycle schema."
  [topic]
  (when-not (contains? @lifecycle-topics topic)
    (swap! lifecycle-topics conj topic))
  nil)

(mr/def ::lifecycle
  [:map {:closed true}
   [:object {:optional true} [:map]]
   [:previous-object {:optional true} [:map]]
   [:user-id [:maybe pos-int?]]
   [:context {:optional true}
    [:map {:closed true}
     [:revision-message {:optional true} [:maybe :string]]
     [:reverting? {:optional true} :boolean]
     [:archived-with {:optional true} [:tuple :keyword pos-int?]]
     [:details {:optional true} [:map]]]]])
