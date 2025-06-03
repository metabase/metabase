(ns metabase.eid-translation.core
  (:require
   [metabase.eid-translation.impl]
   [metabase.eid-translation.util]
   [potemkin :as p]))

(comment metabase.eid-translation.impl/keep-me
         metabase.eid-translation.util/keep-me)

(p/import-vars
 [metabase.eid-translation.impl
  Status
  default-counter
  statuses]
 [metabase.eid-translation.util
  ->id
  model->entity-ids->ids])
