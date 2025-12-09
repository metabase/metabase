(ns metabase-enterprise.metabot-v3.models.metabot-use-case
  "Model for Metabot use cases (e.g., nlq, sql, transforms, omnibot, embedding).

  Use cases are predefined configurations that map to AI service profiles.
  Default use cases are created via database migrations."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotUseCase [_model] :metabot_use_case)

(doto :model/MetabotUseCase
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/hash-fields :model/MetabotUseCase
  [_table]
  [:metabot_id :name])

(defmethod serdes/generate-path "MetabotUseCase" [_ entity]
  (conj (serdes/generate-path "Metabot" (t2/select-one :model/Metabot (:metabot_id entity)))
        (serdes/infer-self-path "MetabotUseCase" entity)))

(defmethod serdes/make-spec "MetabotUseCase" [_model-name _opts]
  {:copy      [:entity_id :name :enabled]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :metabot_id (serdes/parent-ref)}})
