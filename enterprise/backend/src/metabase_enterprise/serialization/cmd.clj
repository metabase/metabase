(ns metabase-enterprise.serialization.cmd
  (:refer-clojure :exclude [load])
  (:require [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase-enterprise.serialization
             [dump :as dump]
             [load :as load]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.util
             [i18n :refer [deferred-trs trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private Mode
  (su/with-api-error-message (s/enum :skip :update)
    (deferred-trs "invalid --mode value")))

(def ^:private OnError
  (su/with-api-error-message (s/enum :continue :abort)
    (deferred-trs "invalid --on-error value")))

(def ^:private Context
  (su/with-api-error-message
    {(s/optional-key :on-error) OnError
     (s/optional-key :mode)     Mode}
    (deferred-trs "invalid context seed value")))

(s/defn load
  "Load serialized metabase instance as created by `dump` command from directory `path`."
  [path context :- Context]
  (mdb/setup-db!)
  (when-not (load/compatible? path)
    (log/warn (trs "Dump was produced using a different version of Metabase. Things may break!")))
  (let [context (merge {:mode     :skip
                        :on-error :continue}
                       context)]
    (try
      (do
        (load/load (str path "/users") context)
        (load/load (str path "/databases") context)
        (load/load (str path "/collections") context)
        (load/load-settings path context)
        (load/load-dependencies path context))
      (catch Throwable e
        (log/error (trs "Error loading dump: {0}" (.getMessage e)))))))

(defn- select-entities-in-collections
  [model collections]
  (db/select model {:where [:or [:= :collection_id nil]
                                (if (not-empty collections)
                                  [:in :collection_id (map u/get-id collections)]
                                  false)]}))

(defn dump
  "Serialized metabase instance into directory `path`."
  [path user]
  (mdb/setup-db!)
  (let [users       (if user
                      (let [user (db/select-one User
                                   :email        user
                                   :is_superuser true)]
                        (assert user (trs "{0} is not a valid user" user))
                        [user])
                      [])
        collections (db/select Collection
                      {:where [:or [:= :personal_owner_id nil]
                                   [:= :personal_owner_id (some-> users first u/get-id)]]})]
    (dump/dump path
               (Database)
               (Table)
               (field/with-values (Field))
               (Metric)
               (Segment)
               collections
               (select-entities-in-collections Card collections)
               (select-entities-in-collections Dashboard collections)
               (select-entities-in-collections Pulse collections)
               users))
  (dump/dump-settings path)
  (dump/dump-dependencies path)
  (dump/dump-dimensions path))
