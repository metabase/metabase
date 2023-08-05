(ns metabase.util.malli.humanize
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [malli.util]))

(defn- flatten-error
  "Flatten an error like

    [[0 2] \"broken\"]

  to

    [[] [[nil nil \"broken\"]]]"
  [[path error :as path-error]]
  (if (peek path)
    (recur [(pop path) (me/-push (if (integer? (peek path)) [] {}) (peek path) error nil)])
    path-error))

(defn- ancestor-paths
  "Paths to ancestor schemas given a `path` to a schema. e.g.

    [1 2 3] => [[1 2] [1] []]"
  [path]
  (concat (take-while seq (drop 1 (iterate pop (vec path))))
          [[]]))

(defn- ancestor-error-messages
  "Error messages for the schemas at the [[ancestor-paths]]."
  [{:keys [schema], :as _explanation} {:keys [path], :as error} options]
  {:pre [(vector? path)]}
  (let [options (merge {:unknown nil} options)]
    (transduce
     (comp (map (fn [ancestor-path]
                  (when-let [ancestor-schema (some-> (malli.util/get-in schema ancestor-path) mc/schema mc/deref-all)]
                    (when-let [message (me/error-message (assoc error
                                                                :in     []
                                                                :path   ancestor-path
                                                                :schema (mc/schema ancestor-schema)
                                                                :type   nil)
                                                         options)]
                      [ancestor-path message]))))
           (filter some?))
     conj
     []
     (ancestor-paths path))))


(defn- prepend-error [error ancestor-error]
  ;; don't wrap something with identical error messages more than once.
  (if (and (sequential? error)
           (= (first error) ancestor-error))
    error
    ^::me/error (list ancestor-error error)))

(defn- prepend-error-in-path [message ancestor-error [k & more :as _path]]
  (if (and k (map? message))
    (update message k prepend-error-in-path ancestor-error more)
    (prepend-error message ancestor-error)))

(defn- combine-error-messages
  "Combine [[ancestor-error-messages]] into a `message` giving you something like

    (\"map with :a\" {:a (\"map with :b\" {:b \"should be a number\"})})"
  [[path error] ancestor-errors]
  [path
   (reduce
    (fn [error [error-path ancestor-error]]
      ;; if we have something like an `:or` then the first thing in the error path will be the index to the
      ;; particular schema we're dealing with. Ignore that since the error message is just for this schema.
      (let [error-path (if (integer? (first error-path))
                         (rest error-path)
                         error-path)]
        (prepend-error-in-path error ancestor-error error-path)))
    error
    ancestor-errors)])

(defn- fix-output-path
  "An error pair like

    [[] {:a {:b {:c \"x\"}}}]

  should get flattened to

    [[:a :b :c] \"x\"]"
  [[path error :as path-error]]
  (cond
    (not= (count error) 1)
    path-error

    (map? error)
    (let [[k v] (first error)]
      (recur [(conj (vec path) k) v]))

    (sequential? error)
    (recur [(conj (vec path) 0) (first error)])))

(defn- resolve-error
  "'Improved' version of the default error resolver, [[me/-resolve-direct-error]], that does 2 additional things:

  1. Includes `:error/message`/`:error/fn` messages from the parent schemas in the path to the thing that failed, e.g.

    (\"valid :absolute-datetime-clause\" [nil {:lib/uuid \"should be a string\"}])

  as opposed to just

    {:lib/uuid \"should be a string\"}

  or not returning the error at all (which seems to happen sometimes with `:or` schemas when the errors are at
  different depths).   See [[metabase.util.malli.humanize-test]] for examples."
  [explanation error options]
  (let [ancestor-errors (ancestor-error-messages explanation error options)]
    (-> (me/-resolve-direct-error explanation error options)
        flatten-error
        (combine-error-messages ancestor-errors)
        fix-output-path)))

(defn humanize
  "This is like [[me/humanize]], but generates what I (Cam) consider to be much better error messages using out
  custom [[resolve-error]]."
  [error]
  (me/humanize error {:resolve resolve-error}))
