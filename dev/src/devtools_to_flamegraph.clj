;; A script to convert Chrome Devtools performance traces into clj-async-profiler flamegraphs. Makes exploring the
;; flamegraph much easier than doing it with Devtools. Usage:
;;
;; (result-to-collapsed-file (load-and-parse-trace "<path-to-Trace.json-file>") "/tmp/result.txt")
;; (clj-async-profiler.core/generate-flamegraph "/tmp/result.txt" {})
;;
;; This will first generate a collapsed stacks .txt file and then generate a flamegraph from it that you can open in
;; the browser.

(ns devtools-to-flamegraph
  (:require [clojure.data.json :as json]))

(defn append-to-node-map [node-map nodes]
  (reduce (fn [node-map node]
            (assoc node-map (:id node) (assoc node
                                              :children #{}
                                              :self-time 0
                                              :total-time 0)))
          node-map
          nodes))

(defn link-parent-children
  "Link parent-child relationships in the node map."
  [node-map nodes]
  (reduce (fn [node-map node]
            (if-some [parent-id (:parent node)]
              (update-in node-map [parent-id :children] conj (:id node))
              node-map))
          node-map
          nodes))

(defn update-timing [node-map node-id time-delta]
  (loop [node-map node-map, current-id node-id]
    (if (nil? current-id)
      node-map
      (let [current-node (get node-map current-id)]
        (recur (update-in node-map [current-id :total-time] + time-delta)
               (:parent current-node))))))

(defn process-samples
  "Process samples to calculate timing information"
  [node-map samples time-deltas]
  (reduce (fn [node-map [node-id time-delta]]
            (-> node-map
                (update-in [node-id :self-time] + time-delta)
                ;; Update total time for node and ancestors
                (update-timing node-id time-delta)))
          node-map
          (map vector samples time-deltas)))

(defn build-tree-structure
  "Convert flat node map to nested tree structure"
  [node-map root-node-ids]
  (letfn [(build-subtree [node-id]
            (let [node (get node-map node-id)
                  children (mapv build-subtree (:children node))]
              (assoc node :children children)))]
    (mapv build-subtree root-node-ids)))

(defn parse-cpu-profile
  "Main function to parse CPU profile data into flamegraph hierarchy"
  [node-map profile-data]
  (let [timeDeltas (:timeDeltas profile-data)
        {:keys [nodes samples]} (:cpuProfile profile-data)
        node-map (append-to-node-map node-map nodes)
        node-map (link-parent-children node-map nodes)

        timed-map (process-samples node-map samples timeDeltas)]
    (-> node-map
        (append-to-node-map nodes)
        (link-parent-children nodes)
        (process-samples samples timeDeltas))))

(defn parse-profile-chunk
  "Parse a ProfileChunk trace event."
  [node-map trace-event]
  (let [profile-data (get-in trace-event [:args :data])]
    (parse-cpu-profile node-map profile-data)))

;; Helper function to load from JSON file
(defn load-and-parse-trace
  "Load trace file and extract ProfileChunk events"
  [filename]
  (let [trace-data (json/read-str (slurp filename) :key-fn keyword)
        profile-chunks (->> (:traceEvents trace-data)
                            (filter #(= (:name %) "ProfileChunk")))
        node-map (reduce parse-profile-chunk {} profile-chunks)]
    (let [root-ids (->> (vals node-map)
                        (filter #(nil? (:parent %)))
                        (map :id))]
      (build-tree-structure node-map root-ids))))

(defn result-to-collapsed-file [result out]
  (with-open [f (clojure.java.io/writer (clojure.java.io/file out))]
    (binding [*out* f]
      (letfn [(rec [path node]
                (let [fname (:functionName (:callFrame node))
                      fname (cond (empty? fname) "<lambda>"
                                  ;; Append .invoke just to make renderer demunge and color frames as Clojure code.
                                  (.contains ^String fname "$") (str fname ".invoke")
                                  :else fname)
                      path' (conj path fname)
                      self-time (:self-time node)]
                  (when (pos? self-time)
                    (println (str (clojure.string/join ";" path') " " (:self-time node))))
                  (run! #(rec path' %) (:children node))))]
        (run! #(rec [] %) result)))))
