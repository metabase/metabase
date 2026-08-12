(ns metabase.segments.create
  "Segment creation shared by REST and domain workflows."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn definition-table-id
  "Derive the source table ID from a segment definition, or throw a 400 if it has none. Handles MBQL5 and legacy full
  queries as well as MBQL4 fragments (which carry `:source-table` directly)."
  [definition]
  (api/check-400 (when (seq definition)
                   (case (lib/normalized-mbql-version definition)
                     (:mbql-version/mbql5 :mbql-version/legacy)
                     (lib/primary-source-table-id (lib-be/normalize-query definition))
                     ;; default: MBQL4 fragment
                     (let [table-id (:source-table definition)]
                       (when (pos-int? table-id)
                         table-id))))
                 (tru "Segment definition must specify a source table.")))

(defn create!
  "Create and return a hydrated Segment through the standard permission and event path."
  ([body]
   (create! body {}))
  ([{:keys [name description definition], :as body} {:keys [publish-event?], :or {publish-event? true}}]
   (let [table-id (definition-table-id definition)]
     (api/create-check :model/Segment (assoc body :table_id table-id))
     (let [user-id api/*current-user-id*
           segment (api/check-500
                    (first (t2/insert-returning-instances! :model/Segment
                                                           :table_id    table-id
                                                           :creator_id  user-id
                                                           :name        name
                                                           :description description
                                                           :definition  definition)))]
       (when publish-event?
         (mdb/do-after-commit
          #(events/publish-event! :event/segment-create {:object segment :user-id user-id})))
       (t2/hydrate segment :creator)))))
