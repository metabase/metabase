(ns metabase.lib.schema.id
  (:require
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
  [:schema {:doc/title "Valid Database ID"} [:int {:min 1}]])

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
   {:doc/title   "Saved Questions Virtual Database ID"
    :description (:doc (meta #'saved-questions-virtual-database-id))}
   saved-questions-virtual-database-id])

(mr/def ::table
  [:schema {:doc/title "Valid Table ID"} [:int {:min 1}]])

(mr/def ::field
  [:schema {:doc/title "Valid Field ID"} [:int {:min 1}]])

(mr/def ::card
  [:schema {:doc/title "Valid Card ID"} [:int {:min 1}]])

(mr/def ::segment
  [:schema {:doc/title "Valid legacy Segment ID"} [:int {:min 1}]])

(mr/def ::snippet
  [:schema {:doc/title "Valid Snippet ID"} [:int {:min 1}]])

(mr/def ::dimension
  [:schema {:doc/title "Valid Dimension ID"} [:int {:min 1}]])

(mr/def ::action
  [:schema {:doc/title "Valid Action ID"} [:int {:min 1}]])

(mr/def ::dashboard
  [:schema {:doc/title "Valid Dashboard ID"} [:int {:min 1}]])

(mr/def ::dashcard
  [:schema {:doc/title "Valid DashboardCard ID"} [:int {:min 1}]])

(mr/def ::user
  [:schema {:doc/title "Valid User ID"} [:int {:min 1}]])

(mr/def ::pulse
  [:schema {:doc/title "Valid Pulse ID"} [:int {:min 1}]])
