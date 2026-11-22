(ns metabase.metabot.models.metabot-message
  (:require
   [malli.util :as mut]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.config.core :as config]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.schema.migrate-v1-to-v2 :as migrate]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotMessage [_model] :metabot_message)

(doto :model/MetabotMessage
  (derive :metabase/model))

(t2/deftransforms :model/MetabotMessage
  {:usage {:in  mi/json-in
           :out (comp metabot.schema/normalize-usage mi/json-out-with-keywordization)}
   :data  mi/transform-json
   :state {:in  mi/json-in
           :out (comp metabot.schema/normalize-state mi/json-out-with-keywordization)}
   :role  mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-data
  "Check the `data` of `message` against the at-rest format when `message` declares the current `data_version`."
  [{:keys [data data_version] :as message}]
  (when (= schema.v2/current-data-version data_version)
    (schema.v2/check-message-data "metabot_message.data" data))
  message)

(t2/define-before-insert :model/MetabotMessage
  [message]
  (check-data message))

(t2/define-before-update :model/MetabotMessage
  [message]
  (when (some #(contains? (t2/changes message) %) [:data :data_version])
    (check-data message))
  message)

(defn- migrate-v1->v2-on-read
  "Convert a v1 row's `:data` to the v2 format and bump `:data_version`. On failure,
  log and return the row unchanged so a malformed legacy row can't break reads."
  [message]
  (try
    (-> message
        (update :data #(->> (migrate/migrate-v1->v2 %)
                            (schema.v2/check-message-data "migrated metabot_message.data")))
        (assoc :data_version schema.v2/current-data-version))
    (catch Throwable e
      (log/warn "Failed to migrate metabot_message data v1->v2 on read" {:id (:id message)} (ex-message e))
      message)))

(t2/define-after-select :model/MetabotMessage
  [{:keys [data data_version] :as message}]
  (cond
    (not data)
    message

    (= 1 data_version)
    (migrate-v1->v2-on-read message)

    (and config/is-dev? (= 2 data_version))
    (do (schema.v2/check-message-data "metabot_message.data (read)" data)
        message)

    :else
    message))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metabot-messages! :- [:sequential ::metabot.schema/metabot-message]
  "Insert the MetabotMessage `rows` and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::metabot.schema/metabot-message.create]]
  (metabot.db/insert-messages! rows))

(mu/defn update-metabot-messages! :- :nil
  "Apply the one `changes` map to every MetabotMessage of `ids`."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- (mut/dissoc ::metabot.schema/metabot-message.update :id)]
  (when (seq ids)
    (metabot.db/update-messages! ids changes))
  nil)

(mu/defn soft-delete-metabot-messages! :- :int
  "Soft-delete the MetabotMessages matching `conditions` on behalf of the User with `deleted-by-user-id`, returning the
  number of rows updated."
  [conditions         :- ::metabot.schema/metabot-message.soft-delete-conditions
   deleted-by-user-id :- ::lib.schema.id/user]
  (t2/with-transaction [_conn]
    (let [{already true, others false} (group-by #(= deleted-by-user-id (:deleted_by_user_id %))
                                                 (metabot.db/messages-matching conditions))]
      (+ (if (seq already) (metabot.db/soft-delete-messages! (mapv :id already) nil) 0)
         (if (seq others) (metabot.db/soft-delete-messages! (mapv :id others) deleted-by-user-id) 0)))))

(mu/defn seed-metabot-message!
  "Insert the MetabotMessage `row` as given, its timestamps included, which the testing API seeds."
  [row :- (mut/dissoc ::metabot.schema/metabot-message :id)]
  (metabot.db/insert-messages! [row]))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotMessage [_model]
  {:skip? false})
