(ns metabase.util.write-batch
  "A batch of writes in which the hooks of one write mark the owner they change, and the work of each owner runs once
  when the batch ends, or at once for a write outside a batch."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *batch*
  "Within [[do-with-write-batch]], an atom of `{:order [owner-key ...], :entries {owner-key {:data d, :finish f}}}`,
  the only way the hooks of a batch can run the work of an owner once."
  nil)

(mu/defn batching? :- :boolean
  "Whether a batch of writes is open."
  []
  (some? *batch*))

(mu/defn mark!
  "Record that a write changed the owner `owner-key`, the data of the batch for it becoming `(update-data data)`, with
  `data` nil for the first mark, and have `(finish! data)` run once when the batch ends, or at once without a batch."
  [owner-key   :- [:sequential [:or :keyword :int]]
   update-data :- ifn?
   finish!     :- ifn?]
  (if-let [batch *batch*]
    (swap! batch
           (fn [{:keys [entries] :as state}]
             (-> (if (contains? entries owner-key) state (update state :order conj owner-key))
                 (assoc-in [:entries owner-key] {:data   (update-data (get-in entries [owner-key :data]))
                                                 :finish finish!}))))
    (finish! (update-data nil))))

(defn- finish-all!
  "Run the work of every marked owner in the order of its first mark, including the owners marked meanwhile."
  [batch]
  (loop [done 0]
    (let [{:keys [order entries]} @batch]
      (when (< done (count order))
        (let [owner-key (nth order done)
              {:keys [data finish]} (get entries owner-key)]
          (finish data)
          (recur (inc done)))))))

(mu/defn do-with-write-batch
  "Run `thunk`, with the work of what its writes mark done once per owner after it ends, and not at all when it
  throws; inside another batch, join it."
  [thunk :- ifn?]
  (if *batch*
    (thunk)
    (let [batch (atom {:order [] :entries {}})]
      (u/prog1 (binding [*batch* batch] (thunk))
        (binding [*batch* nil]
          (finish-all! batch))))))
