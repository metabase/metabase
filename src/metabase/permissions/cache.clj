(ns metabase.permissions.cache
  "The request cache of data permission answers, with the Tables and Databases the request loaded, so that one batched
  query answers a check for the asked row and the loaded ones.")

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "An atom `{:loaded {model {:ids [...] :seen #{...}}} :answers {key answer}}` bound per request, or nil."
  nil)

(defmacro with-cache
  "Runs `body` with a fresh [[*cache*]]."
  [& body]
  `(binding [*cache* (atom {})]
     ~@body))

(defn register-loaded!
  "Remembers the row of `model`, `:model/Table` or `:model/Database`, with primary key `id` as loaded in this request."
  [model id]
  (when-let [cache (and id *cache*)]
    (when-not (contains? (get-in @cache [:loaded model :seen]) id)
      (swap! cache (fn [c]
                     (cond-> c
                       (not (contains? (get-in c [:loaded model :seen]) id))
                       (-> (update-in [:loaded model :ids] (fnil conj []) id)
                           (update-in [:loaded model :seen] (fnil conj #{}) id))))))))

(defn cached
  "The answer under `key`, computed by `f` once per request and every time outside one."
  [key f]
  (if-let [cache *cache*]
    (let [answers (:answers @cache)]
      (if (contains? answers key)
        (get answers key)
        (let [answer (f)]
          (swap! cache assoc-in [:answers key] answer)
          answer)))
    (f)))

(def ^:private max-batch-size
  "How many ids one batched answer covers at most."
  10000)

(defn- next-unanswered
  "The first `n` of the `ids` at or after position `start` for which `answered?` is false, and the position after the
  last id looked at."
  [ids start n answered?]
  (loop [i start, acc []]
    (if (or (= n (count acc)) (>= i (count ids)))
      [acc i]
      (let [id (nth ids i)]
        (recur (inc i) (cond-> acc (not (answered? id)) (conj id)))))))

(defn cached-batch
  "The answer under `[question id]`, computed by `f`, which takes ids and returns `{id answer}`, for `id` and the next
  unanswered rows of `model` loaded in this request, each loaded row looked at once per question, and for `id` alone
  outside a request."
  [question model id f]
  (if-let [cache *cache*]
    (let [{:keys [loaded answers]} @cache]
      (if (contains? answers [question id])
        (get answers [question id])
        (let [[more position] (next-unanswered (get-in loaded [model :ids])
                                               (get answers [question ::position] 0)
                                               (dec max-batch-size)
                                               #(or (= % id) (contains? answers [question %])))
              ids             (into [id] more)
              computed        (f ids)]
          (swap! cache update :answers
                 #(-> (into (or % {}) (map (fn [i] [[question i] (get computed i)])) ids)
                      (assoc [question ::position] position)))
          (get computed id))))
    (get (f [id]) id)))
