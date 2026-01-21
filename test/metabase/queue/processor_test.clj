(ns metabase.queue.processor-test
  (:require [clojure.test :refer :all]
            [metabase.queue.listener :as q.handler]))

(deftest handle-payload
  (q.handler/handle! {:queue           :queue/name
                      :id       1
                      :messages ["message1" "message2"]}))
