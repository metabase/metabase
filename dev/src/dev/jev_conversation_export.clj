(ns dev.jev-conversation-export
  "Run the Metabot conversation review over a JSON export of `metabot_message` rows (one JSON object per line, as a
  Metabase query-result download produces) instead of the app DB. For tuning questions and thresholds on
  production-shaped data without importing it.

    (def idx (index \"/path/to/export.json\"))
    (def results (review-conversations \"/path/to/export.json\" (take 50 (keys idx))))
    (report results)"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.jev.apps.conversations :as conversations]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- parse-row [line]
  (-> (json/decode+kw line)
      (update :id #(Long/parseLong (str/replace (str %) "," "")))))

(defn- scan!
  "Call `f` with every parsed row of the export at `path`, streaming line by line."
  [path f]
  (with-open [rdr (io/reader path)]
    (doseq [line (line-seq rdr)
            :let [line (str/replace (str/trim line) #",$" "")]
            :when (str/starts-with? line "{")]
      (f (parse-row line)))))

(defn index
  "conversation id -> `{:profile :messages}` for every conversation in the export at `path`."
  [path]
  (let [acc (volatile! {})]
    (scan! path (fn [{:keys [conversation_id profile_id]}]
                  (vswap! acc update conversation_id
                          #(-> (or % {:messages 0}) (update :messages inc) (assoc :profile profile_id)))))
    @acc))

(defn load-conversations
  "conversation id -> message rows (oldest first) for the conversations in `ids`."
  [path ids]
  (let [wanted (set ids)
        acc    (volatile! {})]
    (scan! path (fn [{:keys [conversation_id] :as row}]
                  (when (wanted conversation_id)
                    (vswap! acc update conversation_id (fnil conj []) row))))
    (update-vals @acc #(vec (sort-by :id %)))))

(defn review-conversations
  "Review the conversations `ids` of the export at `path`, `parallelism` at a time. Returns
  `{conversation-id {:record … :first-user … :last-user …}}`; Jev failures come back as `{:error …}`."
  ([path ids] (review-conversations path ids 8))
  ([path ids parallelism]
   (let [convs (load-conversations path ids)]
     (into {}
           (mapcat (fn [chunk]
                     (pmap (fn [[id rows]]
                             (let [{:keys [ok record error]} (conversations/review-rows rows)
                                   users (keep :user (conversations/transcript rows))]
                               [id (if ok
                                     {:record record :first-user (first users) :last-user (last users)}
                                     {:error error})]))
                           chunk)))
           (partition-all parallelism convs)))))

(defn report
  "Print label and issue distributions and the conversations with the most issues."
  [results]
  (let [records (keep (comp :record val) results)]
    (println "reviewed:" (count records) "failed:" (count (filter (comp :error val) results)))
    (println "labels:" (frequencies (map :label records)))
    (println "issues:" (sort-by (comp - val) (frequencies (mapcat :issues records))))
    (println "tool errors:" (->> records (mapcat #(get-in % [:answers :flags :tool_error_kinds])) frequencies
                                 (sort-by (comp - val)) (take 5)))
    (doseq [[id {:keys [record first-user last-user]}] (->> results
                                                            (filter (comp :record val))
                                                            (sort-by (comp - count :issues :record val))
                                                            (take 20))]
      (println "\n" id (:label record) (:issues record))
      (println "   first:" (some-> first-user (subs 0 (min 120 (count first-user)))))
      (println "   last: " (some-> last-user (subs 0 (min 120 (count last-user)))))
      (println "   turns:" (mapv (juxt :index (comp :choice :reaction)) (get-in record [:answers :turns]))))))
