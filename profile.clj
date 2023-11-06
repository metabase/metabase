(comment
  (defn x []
    (require 'criterium.core 'metabase.query-processor 'metabase.test)
    (criterium.core/quick-bench
     (metabase.query-processor/process-query
      (metabase.test/mbql-query :venues))))

  (defn y []
    (require 'metabase.query-processor 'metabase.test)
    (time
     (dotimes [_ 1000]
       (metabase.query-processor/process-query
        (metabase.test/mbql-query :venues))))))

;; NEW:
;;
;; Evaluation count : 60 in 6 samples of 10 calls.
;;             Execution time mean : 11.497840 ms
;;    Execution time std-deviation : 954.868440 µs
;;   Execution time lower quantile : 10.547204 ms ( 2.5%)
;;   Execution time upper quantile : 12.918752 ms (97.5%)
;;                   Overhead used : 1.473500 ns

"Elapsed time: 10489.845537 msecs"
"Elapsed time: 10806.578978 msecs"
"Elapsed time: 10700.020449 msecs"

;; OLD:
;;
;; Evaluation count : 66 in 6 samples of 11 calls.
;;              Execution time mean : 8.942976 ms
;;     Execution time std-deviation : 319.087072 µs
;;    Execution time lower quantile : 8.563611 ms ( 2.5%)
;;    Execution time upper quantile : 9.316540 ms (97.5%)
;;                    Overhead used : 1.566668 ns

"Elapsed time: 16050.198322 msecs"
"Elapsed time: 10201.648536 msecs"
