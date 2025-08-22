(ns metabase-enterprise.metabot-v3.models.metabot
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/Metabot [_model] :metabot)

(doto :model/Metabot
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Metabot
  [_table]
  [:name])

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/generate-path "Metabot" [_ metabot]
  [(serdes/infer-self-path "Metabot" metabot)])

(defmethod serdes/make-spec "Metabot" [_model-name _opts]
  {:copy      [:name :description :entity_id :use_verified_content]
   :transform {:created_at    (serdes/date)
               :updated_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)}})
