(ns metabase-enterprise.data-sensitivity.overlay
  "The pending AI proposals that the preview read of
  [[metabase.warehouse-schema.ai-proposals/with-ai-proposal-previews]] shows over the Field values."
  (:require
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise pending-ai-proposals
  "The pending AI proposals of the Fields in `field-ids`, from `metadata_generation_proposal`."
  :feature :data-sensitivity
  [field-ids]
  (db/proposals-for-fields field-ids))
