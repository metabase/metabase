(ns metabase.permissions.cache
  "The request cache of data permission answers, so that one batched query answers a check for the asked row and the
  rows of the same model that the request loaded."
  (:require
   [metabase.models.cache :as models.cache]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "An atom `{key answer}` bound per request, or nil."
  nil)

(defmacro with-cache
  "Runs `body` with a fresh [[*cache*]] and the loaded rows remembered."
  [& body]
  `(binding [*cache* (atom {})]
     (models.cache/with-loaded-rows
       ~@body)))

(defn cached
  "The answer under `key`, computed by `f` once per request and every time outside one."
  [key f]
  (if-let [cache *cache*]
    (let [answers @cache]
      (if (contains? answers key)
        (get answers key)
        (let [answer (f)]
          (swap! cache assoc key answer)
          answer)))
    (f)))

(def ^:private max-batch-size
  "How many ids one batched answer covers at most."
  10000)

(defn cached-batch
  "The answer under `[question id]`, computed by `f`, which takes ids and returns `{id answer}`, for `id` and the
  unanswered rows of `model` loaded in this request, which in dev must include `id`, and for `id` alone outside a
  request."
  [question model id f]
  (if-let [cache *cache*]
    (let [answers @cache]
      (models.cache/check-loaded! model id)
      (if (contains? answers [question id])
        (get answers [question id])
        (let [ids      (into [id]
                             (comp (remove #(or (= % id) (contains? answers [question %])))
                                   (take (dec max-batch-size)))
                             (models.cache/loaded-ids model))
              computed (f ids)]
          (swap! cache into (map (fn [i] [[question i] (get computed i)])) ids)
          (get computed id))))
    (get (f [id]) id)))
