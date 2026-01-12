(ns metabase.permissions-rest.api-test-util
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.permissions-rest.schema :as permissions-rest.schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::graph-output
  [:map-of ::permissions-rest.schema/group-id ::permissions-rest.schema/strict-db-graph])

(defn- decode-and-validate [schema value]
  (mr/validate schema (mc/decode schema value (mtx/string-transformer))))

(defn validate-graph-api-groups
  "Handles string->keyword transformations in DataPerms"
  [graph]
  (decode-and-validate ::graph-output graph))
