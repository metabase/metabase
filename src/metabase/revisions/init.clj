(ns metabase.revisions.init
  (:require
   [metabase.revisions.events]
   ;; TODO -- these do not really need to be loaded on launch, only when we want to use revision-related methods
   ;; in [[metabase.revisions.models.revision]]. We should refactor the code so these are only loaded when needed. See
   ;; https://linear.app/metabase/issue/DEV-326
   [metabase.revisions.impl.card]
   [metabase.revisions.impl.dashboard]
   [metabase.revisions.impl.measure]
   [metabase.revisions.impl.segment]
   [metabase.revisions.impl.transform]))
