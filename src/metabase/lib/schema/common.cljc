(ns metabase.lib.schema.common
  (:require
   [metabase.util.malli.registry :as mr]))

;;; Schema for a string that cannot be blank.
(mr/def ::non-blank-string
  [:string {:min 1}])

;;; Schema representing an integer than must also be greater than or equal to zero.
(mr/def ::int-greater-than-or-equal-to-zero
  [:int {:min 0}])

(mr/def ::int-greater-than-zero
  [:int {:min 1}])

(mr/def ::options
  [:map
   [:lib/uuid :uuid]])
