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
