(ns metabase.util.malli.humanize
  (:require
   [malli.error :as me]))

(defn- resolve-error
  "This is the same behavior as what [[malli.error/humanize]] does to resolve errors."
  [explanation error]
  (me/-resolve-direct-error explanation error {:wrap :message, :resolve me/-resolve-direct-error}))

(defn- flatten-error
  "Given a `[path message]` pair like

    [[2] \"some error\"]

  return a flattened error message like

    [nil nil \"some error\"]"
  [[path message]]
  (if (empty? path)
    message
    (recur
     [(butlast path)
      (if (integer? (last path))
        (me/-push [] (last path) message nil)
        {(last path) message})])))

(defn- merge-errors
  "Merge two flattened errors into a single error, e.g.

    (merge-errors {:x \"oops\"}
                  {:x \"oh no\"})
    ;; => {:x (\"oops\" \"oh no\")}

  List-like structures are used to differentiate multiple errors (e.g., the result of an `:or` schema) from single
  errors (which use a vector instead)."
  [msg-1 msg-2]
  (cond
    (= msg-1 msg-2)
    msg-1

    (nil? msg-1)
    msg-2

    (seq? msg-1)
    (distinct (concat msg-1 (if (seq? msg-2) msg-2 [msg-2])))

    (and (map? msg-1)
         (map? msg-2))
    (merge-with merge-errors msg-1 msg-2)

    (and (vector? msg-1)
         (vector? msg-2)
         (= (count msg-1) (count msg-2)))
    (mapv merge-errors msg-1 msg-2)

    :else
    (distinct (list msg-1 msg-2))))

(defn humanize
  "Improved version of [[malli.error/humanize]]. This is mostly similar to vanilla [[malli.error/humanize]], but
  combines 'resolved' errors in a different way that avoids discarding errors in `:or` schemas when they occur at
  different levels of nesting (see [[metabase.util.malli.humanize-test/basic-test]]
  or [[metabase.util.malli.humanize-test/basic-test-2]] for example) and eliminates duplicates."
  [{:keys [errors], :as explanation}]
  (transduce
   (comp (map (fn [error]
                (resolve-error explanation error)))
         (map flatten-error))
   (completing merge-errors)
   nil
   errors))
