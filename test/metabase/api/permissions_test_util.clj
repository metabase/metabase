(ns metabase.api.permissions-test-util
  (:require [malli.core :as mc]
            [malli.transform :as mtx]
            [metabase.api.permission-graph :as api.permission-graph]))

(def ^:private graph-output-schema
  [:map-of @#'api.permission-graph/GroupId @#'api.permission-graph/StrictDbGraph])

(defn- decode-and-validate [schema value]
  (mc/validate schema (mc/decode schema value (mtx/string-transformer))))

(defn validate-graph-api-groups
  "Handles string->keyword transofmrations in DataPerms"
  [graph]
  (decode-and-validate graph-output-schema graph))
