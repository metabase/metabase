(ns metabase.lib.schema.id
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

;;; these aren't anything special right now, but maybe in the future we can do something special/intelligent with
;;; them, e.g. when we start working on the generative stuff

(mr/def ::database
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::table
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::field
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::card
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::segment
  ::common/int-greater-than-or-equal-to-zero)

(mr/def ::metric
  ::common/int-greater-than-or-equal-to-zero)
