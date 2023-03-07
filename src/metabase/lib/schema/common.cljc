(ns metabase.lib.schema.common
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]))

;;; Schema for a string that cannot be blank.
(mr/def ::non-blank-string
  [:and
   [:string {:min 1}]
   [:fn (complement str/blank?)]])

;;; Schema representing an integer than must also be greater than or equal to zero.
(mr/def ::int-greater-than-or-equal-to-zero
  [:int {:min 0}])

(mr/def ::int-greater-than-zero
  [:int {:min 1}])

(mr/def ::uuid
  ;; TODO -- should this be stricter?
  [:string {:min 36, :max 36}])

(mr/def ::options
  [:map
   [:lib/uuid ::uuid]])
