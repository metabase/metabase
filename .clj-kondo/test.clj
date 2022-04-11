(ns test
  (:require [metabase.query-processor.streaming :as streaming]
            [toucan.models :as models]))

(models/defmodel Card :foo)

(map->Card {:foo 1})
(map->CardInstance {:foo 1})

(streaming/streaming-response [x 1 (inc x)])
