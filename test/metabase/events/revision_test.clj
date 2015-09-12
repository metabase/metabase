(ns metabase.events.revision-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.events.revision :refer :all]
            (metabase.models [user :refer [User]]
                             [view-log :refer [ViewLog]])
            [metabase.test.data :refer :all]
            [metabase.test.util :refer [expect-eval-actual-first with-temp random-name]]
            [metabase.test-setup :refer :all]))

;; TODO - come back and fill this out with direct tests of the `(process-revision-event)` function
;;        this isn't needed right now because our API tests for revisions are covering this functionality
