(ns metabase.driver.query-processor.sudoku
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]
            [clojure.core.logic.fd :as fd]))

(defn- solve-board [hints & {:keys [max-solutions], :or {max-solutions 1}}]
  (let [vars       (vec (repeatedly 81 lvar))
        rows       (mapv vec (partition 9 vars))
        cols       (apply map vector rows)
        squares    (for [corner-x (range 0 9 3)
                         corner-y (range 0 9 3)]
                     (for [x (range corner-x (+ corner-x 3))
                           y (range corner-y (+ corner-y 3))]
                       (get-in rows [x y])))]
    (run max-solutions [q]
      (== q vars)
      (everyg #(fd/in % (fd/domain 1 2 3 4 5 6 7 8 9)) vars)
      (everyg #(if (zero? (hints %)) succeed
                   (== (vars %) (hints %)))
              (range 0 81))
      (everyg fd/distinct rows)
      (everyg fd/distinct cols)
      (everyg fd/distinct squares))))

(defn- rando-solved-board []
  (or (first (solve-board (loop [[position & more] (take 10 (shuffle (range 0 81))), board (vec (repeat 81 0))] ; stick 10 rand digits in a grid & try to solve
                            (if-not position board
                                    (recur more (assoc board position (inc (rand-int 9))))))))
      (recur)))                                                                                                 ; if unsolvable try again

(defn- rando-board [difficulty]
  (let [num-holes        (- 81 ({:easy 48, :medium 36, :hard 24} difficulty))
        solved-board     (vec (rando-solved-board))
        holes-seq        (shuffle (range 0 81))
        unique-solution? #(= 1 (count (solve-board % :max-solutions 2)))]
    (loop [[hole & more] holes-seq, remaining-holes num-holes, board solved-board]
      (cond
        (zero? remaining-holes) board
        (not hole)              (recur (shuffle holes-seq) num-holes solved-board) ; if we run out of possible holes to dig start over with shuffled sequence of hole positions
        :else                   (let [new-board (assoc board hole 0)]
                                  (if (unique-solution? new-board)                 ; try digging a hole
                                    (recur more (dec remaining-holes) new-board)   ; if board is still solvable, recurse with new board state
                                    (recur more remaining-holes board)))))))       ; otherwise throw out the bad hole position and recurse

(defn- nicely-format-board [board]
  (->> board
       (partition 27)
       (interpose (repeat 9 "****************************************"))
       flatten
       (partition 9)
       (apply map vector)
       (partition 3)
       (interpose (repeat 11 "****************************************"))
       flatten
       (map #(if (= % 0) "" %))
       (partition 11)))

(defn generate-sudoku-middleware [qp]
  (fn [{{[ag-type] :aggregation} :query, :as query}]
    (if (not= ag-type "sudoku") (qp query)
        {:data      {:rows    (->> (time (rando-board :medium))
                                   nicely-format-board)
                     :columns (repeat 11 "")
                     :cols    (repeat 11 {:name      ""
                                          :base_type :IntegerField})}
         :row_count 11
         :status    "completed"})))
