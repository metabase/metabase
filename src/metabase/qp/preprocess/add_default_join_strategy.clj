(ns metabase.qp.preprocess.add-default-join-strategy)

(defn add-default-join-strategy [join _context]
  (assoc join :strategy :left-join))

(defn add-default-join-strategy-middleware [what]
  (when (= what :lib.walk/join.post)
    #'add-default-join-strategy))
