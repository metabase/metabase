(ns metabase.lib.schema.id
  (:require
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
  "Valid Database ID"
  pos-int?)

(def saved-questions-virtual-database-id
  "The ID used to signify that a database is 'virtual' rather than physical.

   A fake integer ID is used so as to minimize the number of changes that need to be made on the frontend -- by using
   something that would otherwise be a legal ID, *nothing* need change there, and the frontend can query against this
   'database' none the wiser. (This integer ID is negative which means it will never conflict with a *real* database
   ID.)

   This ID acts as a sort of flag. The relevant places in the middleware can check whether the DB we're querying is
   this 'virtual' database and take the appropriate actions."
  -1337)

;;; not sure under what circumstances we actually want to allow this, this is an icky hack. How are we supposed to
;;; resolve stuff with a fake Database ID? I guess as far as the schema is concerned we can allow this tho.
;;;
;;; EDIT: Sometimes the FE uses this when starting a query based on a Card if it doesn't know the database associated
;;; with that Card. The QP will resolve this to the correct Database later.
(mr/def ::saved-questions-virtual-database
  [:=
   {:description (:doc (meta #'saved-questions-virtual-database-id))}
   saved-questions-virtual-database-id])

(mr/def ::table
  "Valid Table ID"
  pos-int?)

(mr/def ::field
  "Valid Field ID"
  [:schema
   {:decode/api (fn [id]
                  (cond-> id (string? id) parse-long))}
   pos-int?])

(mr/def ::card
  "Valid Card ID"
  pos-int?)

(mr/def ::segment
  "Valid legacy Segment ID"
  pos-int?)

(mr/def ::measure
  "Valid Measure ID"
  pos-int?)

(mr/def ::snippet
  "Valid Snippet ID"
  pos-int?)

(mr/def ::dimension
  "Valid Dimension ID"
  pos-int?)

(mr/def ::action
  "Valid Action ID"
  pos-int?)

(mr/def ::dashboard
  "Valid Dashboard ID"
  pos-int?)

(mr/def ::dashcard
  "Valid DashboardCard ID"
  pos-int?)

(mr/def ::user
  "Valid User ID"
  pos-int?)

(mr/def ::pulse
  "Valid Pulse ID"
  pos-int?)

(mr/def ::native-query-snippet
  "Valid Native Query Snippet ID"
  pos-int?)

(mr/def ::transform
  "Valid Transform ID"
  pos-int?)

(mr/def ::collection
  "Valid Collection ID"
  pos-int?)

(mr/def ::sandbox
  "Valid Sandbox ID"
  pos-int?)
