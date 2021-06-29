(ns metabase.task.bad-card-checks
  "Contains a Metabase task which periodically checks for cards turning bad and marks them as bad."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.triggers :as triggers]
            [java-time :as t]
            [metabase.config :as config]
            [metabase.public-settings :as public-settings]
            [metabase.task :as task]
            [metabase.util.i18n :refer [trs]]))

;; You can't run all the cards every time, that takes too long.
;; Slip in a `limit 1` to everything, instead.
;; Question goes,
;;  1. Are there ways to create degenerate situations where even the `limit 1` makes things too long?
;;  2. This one can't do anything about wrong and slow answers, just stuff that explodes


