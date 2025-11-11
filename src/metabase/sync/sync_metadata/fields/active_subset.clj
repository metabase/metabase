(ns metabase.sync.sync-metadata.fields.active-subset
  (:require
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.common :as common]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn- remove-field-from-active-subset!
  [table          :- i/TableInstance
   metabase-field :- common/TableMetadataFieldWithID]
  ;; TODO: Can following poison logs?s
  (log/debugf "Removing Field ''%s'' from active subset."
              (common/field-metadata-name-for-logging table metabase-field))
  (when (pos? (t2/update! :model/Field (u/the-id metabase-field) {:active_subset false}))
    1))

(defn adjust-active-subset!
  "TBD Remove fields from active subset"
  [table db-metadata our-metadata]
  (sync-util/sum-for
   [metabase-field our-metadata
    :when          (not (common/matching-field-metadata metabase-field db-metadata))]
   ;; TODO: Can following poison logs?
    (sync-util/with-error-handling (format "Error removing %s from active subset"
                                           (common/field-metadata-name-for-logging table metabase-field))
      (remove-field-from-active-subset! table metabase-field))))
