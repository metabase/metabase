(ns metabase.tasks.nightly
  "Security-lint test example: code only a scheduled job and a queue consumer reach."
  (:require
   [clojure.java.shell :as shell]
   [clojurewerkz.quartzite.jobs :as jobs]
   [metabase.mq.core :as mq]
   [metabase.tasks.helpers :as helpers]))

(jobs/defjob CleanUp [_ctx]
  (helpers/purge! "tmp"))

(mq/def-listener! :queue/reindex [messages]
  (helpers/purge! (first messages)))

(defn- run-script [name] (shell/sh "bash" "-c" (str "./" name)))

(defn -main [& _]
  (helpers/purge! "startup"))
