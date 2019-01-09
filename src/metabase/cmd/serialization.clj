(ns metabase.cmd.serialization
  (:require [clojure.tools.logging :as log]
            [metabase.db :as mdb]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [field :refer [Field] :as field]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.serialization
             [dump :as dump]
             [load :as load]]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:refer-clojure :exclude [load]))

(def ^:private Mode
  (su/with-api-error-message (s/enum :skip :update)
    (trs "invalid mode value")))

(s/defn load
  "Load serialized metabase instance as created by `dump` command from directory `path`."
  [path mode :- Mode]
  (mdb/setup-db-if-needed!)
  (when-not (load/compatible? path)
    (log/warn (trs "Dump was produced using a different version of Metabase. Things may break!")))
  (let [context {:mode mode}]
    (load/load path context User)
    (load/load path context Database)
    (load/load path context Collection)
    (load/load-settings path context)
    (load/load-dependencies path context)))

(defn dump
  "Serialized metabase instance into directory `path`."
  [path user]
  (mdb/setup-db-if-needed!)
  (assert (db/select-one User
            :email user
            :is_superuser true)
    (trs "{0} is not a valid user" user))
  (dump/dump path
             (Database)
             (Table)
             (field/with-values (Field))
             (Metric)
             (Segment)
             (db/select Collection :personal_owner_id nil)
             (Card)
             (Dashboard)
             (Pulse))
  (dump/dump-settings path)
  (dump/dump-dependencies path)
  (dump/dump-dimensions path))
