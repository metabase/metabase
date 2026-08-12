(ns metabase.measures.create
  "Measure creation shared by REST and domain workflows."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn definition-table-id
  "Derive the source table ID from a normalized Measure definition, or throw a 400 if it has none."
  [normalized-definition]
  (api/check-400 (when (seq normalized-definition)
                   (lib/primary-source-table-id normalized-definition))
                 (tru "Measure definition must specify a source table.")))

(defn create!
  "Create and return a hydrated Measure through the standard permission and event path."
  ([body]
   (create! body {}))
  ([{:keys [name description definition], :as body} {:keys [publish-event?], :or {publish-event? true}}]
   (let [table-id (definition-table-id definition)]
     (api/create-check :model/Measure (assoc body :table_id table-id))
     (let [user-id api/*current-user-id*
           measure (api/check-500
                    (first (t2/insert-returning-instances! :model/Measure
                                                           :creator_id  user-id
                                                           :name        name
                                                           :description description
                                                           :definition  definition)))]
       (when publish-event?
         (mdb/do-after-commit
          #(events/publish-event! :event/measure-create {:object measure :user-id user-id})))
       (t2/hydrate measure :creator)))))
