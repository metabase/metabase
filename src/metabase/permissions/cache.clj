(ns metabase.permissions.cache
  "The request cache of data permission answers, so that one batched query answers a check for the asked row and the
  rows of the same model that the request loaded."
  (:require
   [metabase.models.cache :as models.cache]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "An atom `{getter {argument ... answer}}` bound per request, or nil."
  nil)

(defmacro with-cache
  "Runs `body` with a fresh [[*cache*]] and the loaded rows remembered."
  [& body]
  `(binding [*cache* (atom {})]
     (models.cache/with-loaded-rows
       ~@body)))

(defn cached
  "The answer at `path`, computed by `f` once per request and every time outside one."
  [path f]
  (if-let [cache *cache*]
    (let [answer (get-in @cache path ::missing)]
      (if (= ::missing answer)
        (let [answer (f)]
          (swap! cache assoc-in path answer)
          answer)
        answer))
    (f)))

(def ^:private max-batch-size
  "How many ids one batched answer covers at most."
  10000)

(defn cached-batch
  "The answer about `id` under `path`, computed by `f`, which takes ids and returns `{id answer}`, for `id` and the
  unanswered rows of `model` loaded in this request, which in dev must include `id`, and for `id` alone outside a
  request."
  [path model id f]
  (if-let [cache *cache*]
    (let [answers (get-in @cache path)]
      (models.cache/check-loaded model id)
      (if (contains? answers id)
        (get answers id)
        (let [ids      (into [id]
                             (comp (remove #(or (= % id) (contains? answers %)))
                                   (take (dec max-batch-size)))
                             (models.cache/loaded-ids model))
              computed (f ids)]
          (swap! cache update-in path (fnil into {}) (map (fn [i] [i (get computed i)])) ids)
          (get computed id))))
    (get (f [id]) id)))
