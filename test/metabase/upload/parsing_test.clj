(ns metabase.upload.parsing-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.upload.types :as upload-types]))

(deftest parse-number-is-thread-safe-test
  ;; `metabase.upload.parsing` kept one `NumberFormat` instance per locale, shared by the whole
  ;; process. `NumberFormat` is not thread-safe, so two concurrent uploads corrupted each other's
  ;; internal parse state - either throwing "''…'' is not a recognizable number" or, worse, silently
  ;; returning the wrong number. https://linear.app/metabase/issue/GDGT-304
  (testing "concurrent number parsing must not throw or return wrong values (GDGT-304)"
    ;; the five separator settings exercise all four shared formatters
    ;; ("." / ".," -> US, ",." -> DE, ", " -> FR, ".’" -> CH); "241" is a clean integer in each
    (doseq [separators ["." ".," ",." ", " ".’"]]
      (let [parser    (upload-parsing/upload-type->parser ::upload-types/int {:number-separators separators})
            n-threads 50
            n-iters   1000
            mistakes  (->> (repeatedly n-threads
                                       (fn []
                                         (future
                                           (reduce (fn [bad _]
                                                     (+ bad (try
                                                              (if (= (biginteger 241) (parser "241")) 0 1)
                                                              (catch Throwable _ 1))))
                                                   0
                                                   (range n-iters)))))
                           doall
                           (map deref)
                           (reduce +))]
        (testing (format "separators %s" (pr-str separators))
          (is (zero? mistakes)
              (format "%d/%d concurrent parses of \"241\" threw or returned the wrong value"
                      mistakes (* n-threads n-iters))))))))
