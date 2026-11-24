(ns metabase.eid-translation.core
  (:require
   [metabase.eid-translation.impl]
   [metabase.eid-translation.requests]
   [metabase.eid-translation.responses]
   [metabase.eid-translation.util]
   [potemkin :as p]))

(comment metabase.eid-translation.impl/keep-me
         metabase.eid-translation.requests/keep-me
         metabase.eid-translation.responses/keep-me
         metabase.eid-translation.util/keep-me)

(p/import-vars
 [metabase.eid-translation.impl
  Status
  default-counter
  statuses]
 [metabase.eid-translation.requests
  do-with-entity-ids
  ref-schema
  refs->ids
  structure-schema]
 [metabase.eid-translation.responses
  ->entity-ids]
 [metabase.eid-translation.util
  ->id
  ->id-or-404
  model->entity-ids->ids])
