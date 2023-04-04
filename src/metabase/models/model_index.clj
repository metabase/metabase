(ns metabase.models.model-index
  (:require
   [cheshire.core :as json]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.interface :as mi]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel ModelIndex :model_index)
(models/defmodel ModelIndexValue :model_index_value)


;; switch to the one in mi after #29513 lands
(t2/define-before-insert ::created-at-timestamp
  [instance]
  #_{:clj-kondo/ignore [:private-call]}
  (#'mi/add-created-at-timestamp instance))

(derive ModelIndex ::created-at-timestamp)

(def normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json."
  (comp #'mbql.normalize/canonicalize-mbql-clauses
        #'mbql.normalize/normalize-tokens))

(t2/deftransforms ModelIndex
  {:pk_ref {:in json/generate-string
            :out (comp normalize-field-ref #(json/parse-string % true))}})
