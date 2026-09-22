(ns metabase-enterprise.workspaces.models.workspace
  "Toucan 2 model for `workspace`: a named authoring context whose table remappings send transform
  output to workspace tables instead of the canonical ones.

  A workspace spans databases — the `workspace_table_remapping` rows that belong to it each name
  their own `db_id` — so one workspace can isolate tables across several warehouses at once."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers this model."
  nil)

(def WorkspaceName
  "Validation for a workspace name: non-blank, capped at the column's 254 characters."
  (mu/with-api-error-message
   [:and
    {:error/message "invalid workspace name"
     :json-schema   {:type "string" :minLength 1 :maxLength 254}}
    [:string {:min 1 :max 254}]
    [:fn
     {:error/message "invalid workspace name"}
     (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string between 1 and 254 characters.")))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
