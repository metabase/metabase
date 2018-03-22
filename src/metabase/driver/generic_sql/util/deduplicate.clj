(ns metabase.driver.generic-sql.util.deduplicate
  "Utility function for de-duplication as used by Oracle and Teradata drivers."
  (:require [clojure.string :as str]))

(defn- increment-identifier-suffix
  "Add an appropriate suffix to a keyword IDENTIFIER to make it distinct from previous usages of the same identifier,
  e.g.

     (increment-identifier-suffix :my_col)   ; -> :my_col_2
     (increment-identifier-suffix :my_col_2) ; -> :my_col_3"
  [identifier]
  (keyword
   (let [identifier (name identifier)]
     (if-let [[_ existing-suffix] (re-find #"^.*_(\d+$)" identifier)]
       ;; if identifier already has an alias like col_2 then increment it to col_3
       (let [new-suffix (str (inc (Integer/parseInt existing-suffix)))]
         (clojure.string/replace identifier (re-pattern (str existing-suffix \$)) new-suffix))
       ;; otherwise just stick a _2 on the end so it's col_2
       (str identifier "_2")))))

(defn- alias-everything
  "Make sure all the columns in SELECT-CLAUSE are alias forms, e.g. `[:table.col :col]` instead of `:table.col`.
   (This faciliates our deduplication logic.)"
  [select-clause]
  (for [col select-clause]
    (if (sequential? col)
      ;; if something's already an alias form like [:table.col :col] it's g2g
      col
      ;; otherwise if it's something like :table.col replace with [:table.col :col]
      [col (keyword (last (clojure.string/split (name col) #"\.")))])))

(defn deduplicate-identifiers
  "Make sure every column in SELECT-CLAUSE has a unique alias.
   This is done because Oracle can't figure out how to use a query
  that produces duplicate columns in a subselect."
  [select-clause]
  (if (= select-clause [:*])
    ;; if we're doing `SELECT *` there's no way we can deduplicate anything so we're SOL, return as-is
    select-clause
    ;; otherwise we can actually deduplicate things
    (loop [already-seen #{}, acc [], [[col alias] & more] (alias-everything select-clause)]
      (cond
        ;; if not more cols are left to deduplicate, we're done
        (not col)                      acc
        ;; otherwise if we've already used this alias, replace it with one like `identifier_2` and try agan
        (contains? already-seen alias) (recur already-seen acc (cons [col (increment-identifier-suffix alias)]
                                                                     more))
        ;; otherwise if we haven't seen it record it as seen and move on to the next column
        :else                          (recur (conj already-seen alias) (conj acc [col alias]) more)))))