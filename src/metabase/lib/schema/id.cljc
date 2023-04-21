(ns metabase.lib.schema.id
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.mbql.schema :as mbql.s]
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
  ::common/int-greater-than-or-equal-to-zero)

;;; not sure under what circumstances we actually want to allow this, this is an icky hack. How are we supposed to
;;; resolve stuff with a fake Database ID? I guess as far as the schema is concerned we can allow this tho.
(mr/def ::saved-questions-virtual-database
  [:= mbql.s/saved-questions-virtual-database-id])

(mr/def ::table
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::table-card-id-string
  [:re
   {:error/message "card__<id> string"}
   #"^card__\d+$"])

(mr/def ::field
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::card
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::segment
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::metric
  ::common/int-greater-than-or-equal-to-zero)
