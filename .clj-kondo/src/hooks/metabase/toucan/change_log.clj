(ns hooks.metabase.toucan.change-log
  "Lint that a write to the table of a model the change log covers goes through the model. See
  `metabase.change-log.core`."
  (:require
   [clj-kondo.hooks-api :as hooks]))

(def change-log-tables
  "The models that the change log covers, with their tables. `metabase.change-log.hooks-test` checks it against them."
  {:model/Card                       :report_card
   :model/Dashboard                  :report_dashboard
   :model/Database                   :metabase_database
   :model/Field                      :metabase_field
   :model/FieldUserSettings          :metabase_field_user_settings
   :model/NativeQuerySnippet         :native_query_snippet
   :model/Notification               :notification
   :model/NotificationCard           :notification_card
   :model/NotificationHandler        :notification_handler
   :model/NotificationRecipient      :notification_recipient
   :model/NotificationSubscription   :notification_subscription
   :model/PermissionsGroup           :permissions_group
   :model/PermissionsGroupMembership :permissions_group_membership
   :model/Pulse                      :pulse
   :model/PulseCard                  :pulse_card
   :model/PulseChannel               :pulse_channel
   :model/PulseChannelRecipient      :pulse_channel_recipient
   :model/Table                      :metabase_table
   :model/Tenant                     :tenant
   :model/User                       :core_user})

(def ^:private table-write-fns
  "Fns whose first argument names the model or table they write to."
  '#{insert! insert-returning-instance! insert-returning-instances! insert-returning-pk! insert-returning-pks!
     update! update-returning-pks! reducible-update reducible-update-returning-pks delete!})

(def ^:private query-fns
  "Fns that run a query map."
  '#{query query-one reducible-query})

(def ^:private write-clauses
  "The query-map clauses that name the table a write goes to."
  #{:update :delete-from :insert-into})

(defn- test-file?
  "Whether `filename` is in a test source tree."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn- call-to?
  "Whether `node` is a call to a fn named `fn-name`, in any namespace."
  [node fn-name]
  (and (hooks/list-node? node)
       (let [f (some-> node :children first hooks/sexpr)]
         (and (symbol? f) (= fn-name (name f))))))

(defn- change-log-table-node?
  "Whether `node` names the table of a tracked model: `:report_card`, `(t2/table-name :model/Card)`, or either one
  first in a vector, as in `[:report_card :c]`. `(t2/table-name model)` counts too, since `model` can be any model."
  [node]
  (cond
    (hooks/vector-node? node)    (boolean (some-> node :children first change-log-table-node?))
    (hooks/keyword-node? node)   (contains? (set (vals change-log-tables)) (hooks/sexpr node))
    (call-to? node "table-name") (let [model (second (:children node))
                                       model (cond-> model (call-to? model "resolve-model") (-> :children second))]
                                   (or (not (hooks/keyword-node? model))
                                       (contains? change-log-tables (hooks/sexpr model))))
    :else                        false))

(defn- lint-change-log-raw-write!
  "Register a `:metabase/change-log-raw-write` finding when a write names the table of a tracked model rather than the
  model, as in `(t2/update! (t2/table-name :model/Card) ...)` and `(t2/query {:update :report_card ...})`. Such a
  write skips the hooks that write the change log."
  [node]
  (let [[fn-node & args] (:children node)
        verb             (some-> fn-node hooks/sexpr name symbol)]
    (doseq [table (cond
                    (contains? table-write-fns verb) (take 1 args)
                    (contains? query-fns verb)       (for [arg   args
                                                           :when (hooks/map-node? arg)
                                                           [k v] (partition 2 (:children arg))
                                                           :when (and (hooks/keyword-node? k)
                                                                      (contains? write-clauses (hooks/sexpr k)))]
                                                       v))
            :when (change-log-table-node? table)]
      (hooks/reg-finding!
       (assoc (meta table)
              :message (str "This write skips the model's hooks, so the change log misses it. Log the rows with "
                            "`metabase.change-log.core/log-rows!`, unless the change log leaves them out on purpose. "
                            "Then ignore this finding, with the reason in a comment.")
              :type :metabase/change-log-raw-write)))))

(defn lint-write
  "Hook for the Toucan 2 fns that write or run a query map. See [[lint-change-log-raw-write!]]."
  [{:keys [node ns filename] :as input}]
  ;; the change log leaves out migrations
  (when-not (or (test-file? filename)
                (re-find #"^metabase\.app-db\.custom-migrations" (str ns)))
    (lint-change-log-raw-write! node))
  input)
