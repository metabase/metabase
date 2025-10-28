(ns representations.util.malli.common
  (:require
   [clojure.string :as str]
   [representations.util.malli.registry :as mr]))

(mr/def ::non-blank-string
  "Schema for a string that cannot be blank."
  [:and
   {:error/message "non-blank string"
    :json-schema   {:type "string" :minLength 1}}
   [:string {:min 1}]
   [:fn
    {:error/message "non-blank string"}
    (complement str/blank?)]])
