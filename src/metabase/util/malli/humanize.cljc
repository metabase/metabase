(ns metabase.util.malli.humanize
  (:refer-clojure :exclude [resolve])
  (:require
   [malli.core :as mc]
   [malli.error :as me]))

(defn- resolve-schema [?schema]
  (when-let [?schema (some-> ?schema mc/schema)]
    (if (and (mc/-ref-schema? ?schema)
             (keyword? (mc/form ?schema)))
      (mc/deref ?schema)
      ?schema)))

(defn- find-schema [?schema [k & more :as path]]
  (when-let [?schema (resolve-schema ?schema)]
    (if (empty? path)
      ?schema
      (recur (mc/-get ?schema k nil) more))))

(defn- parent-paths [path]
  (cons '() (reverse (take-while seq (iterate butlast (butlast path))))))

(defn- error-message-for-schema [schema error options]
  (let [{error-fn :error/fn, error-message :error/message} (mc/properties (mc/schema schema))]
    (cond
      error-fn      (error-fn error options)
      error-message (str error-message)
      :else         nil)))

(defn- ancestor-explicit-error
  "If one of the ancestor schemas of the erroring schema has `:error/message` or `:error/fn`, return that error."
  [explanation {:keys [path], :as error} options]
  (some (fn [parent-path]
          (when-let [parent-schema (find-schema (:schema explanation) parent-path)]
            (when-let [message (error-message-for-schema parent-schema error options)]
              ;; determine how much of the initial part of the path is irrelevant e.g. if this is an `:or` schema than
              ;; the first part of path is just the index into the appropriate schema, and we want to drop it. Use the
              ;; same function Malli uses -- [[me/error-path]] -- to calculate the original error path; determine how
              ;; much was dropped and then drop the same amount from the parent path.
              (let [error-path        (me/error-path error options)
                    error-parent-path (drop (- (count path)
                                               (count error-path))
                                            parent-path)]
                [error-parent-path
                 message]))))
        (parent-paths path)))

(defn- resolve [explanation error options]
  (or (ancestor-explicit-error explanation error options)
      (me/-resolve-direct-error explanation error options)))

(defn- resolve-error
  "This is the same behavior as what [[malli.error/humanize]] does to resolve errors."
  [explanation error]
  (resolve explanation error {:wrap :message, :resolve resolve}))

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
