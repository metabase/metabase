(ns metabase.lib.schema.id
  (:require
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
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
  [:= saved-questions-virtual-database-id])

(mr/def ::table
  pos-int?)

(mr/def ::field
  pos-int?)

(mr/def ::card
  pos-int?)

(mr/def ::segment
  pos-int?)

(mr/def ::metric
  pos-int?)

(mr/def ::snippet
  pos-int?)

(mr/def ::dimension
  pos-int?)

(mr/def ::action
  pos-int?)

(mr/def ::dashboard
  pos-int?)

(mr/def ::dashcard
  pos-int?)

(mr/def ::user
  pos-int?)

(mr/def ::pulse
  pos-int?)
