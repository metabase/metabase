(ns metabase.public-sharing.db
  "Application database queries for the public sharing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn unarchived-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived `model` rows whose public uuid prefix is `prefix`."
  [model prefix]
  (t2/select [model :id :public_uuid] :public_uuid_prefix prefix :archived false))

(defn unarchived-by-public-uuid-prefix
  "The unarchived `model` rows whose public uuid prefix is `prefix`."
  [model prefix]
  (t2/select model :public_uuid_prefix prefix :archived false))
