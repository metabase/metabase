(ns ^:mb/old-migrations-test metabase.db.custom-migrations.metrics-v2-batch-test
  "These are 'old' tests now since this migration happened in 51."
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.db.custom-migrations.metrics-v2 :as metrics-v2]
   [metabase.db.custom-migrations.metrics-v2-test :as metrics-v2-test]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.net URI)
   (java.nio.file Files FileSystem FileSystems NoSuchFileException)))

(set! *warn-on-reflection* true)

(def ^:private data-file
  "metric-v2-test-data.zip")

(def ^:private ^:dynamic ^FileSystem *data-fs* nil)

(defn- metric-paths
  []
  (let [path (.getPath *data-fs* "/metrics" (into-array String []))]
    (filter #(str/ends-with? (str %) ".csv")
            (.toArray (Files/list path)))))

(defn- card-path
  [instance]
  (.getPath *data-fs* "/cards" (into-array String [(str instance ".csv")])))

(defn- read-metrics
  [path]
  (with-open [r (Files/newBufferedReader path)]
    (let [instances (java.util.HashSet. 2)
          metrics (into {}
                        (map (fn [[instance id definition]]
                               (.add instances instance)
                               [(parse-long id) (json/decode+kw definition)]))
                        (csv/read-csv r))]
      (when (not= (.size instances) 1)
        (throw (ex-info "unexpected number of instances"
                        {:instances (set instances)})))
      [(.. instances iterator next) metrics])))

(defn- metric-ref?
  [expr]
  (and (vector? expr)
       (let [[tag id] expr]
         (and (string? tag)
              (= (u/lower-case-en tag) "metric")
              (int? id)))))

(defn- contains-metric?
  [expr]
  (or (metric-ref? expr)
      (and (seqable? expr)
           (some contains-metric? expr))))

(defn- uses-metric?
  [query]
  (if-let [source-query (:source-query query)]
    (uses-metric? source-query)
    (contains-metric? (:aggregation query))))

(defn- read-cards
  [instance]
  (try
    (with-open [r (-> instance card-path Files/newBufferedReader)]
      (into {}
            (map (fn [[inst id dataset-query]]
                   (when (not= inst instance)
                     (throw (ex-info "unexpected instance"
                                     {:expected instance
                                      :actual inst})))
                   (let [dataset-query (json/decode+kw dataset-query)]
                     [(parse-long id) dataset-query])))
            (csv/read-csv r)))
    (catch NoSuchFileException _
      nil)))

(defn- read-instance
  []
  (let [current-dir (System/getProperty "user.dir")
        uri (URI/create (str "jar:file:" current-dir "/" data-file))
        ^java.util.Map env {}]
    (with-open [zip-fs (FileSystems/newFileSystem uri env)]
      (binding [*data-fs* zip-fs]
        (vec (for [metric-file (metric-paths)
                   :let [[instance metrics] (read-metrics metric-file)
                         cards (read-cards instance)]
                   :when (seq cards)]
               {:instance instance
                :metrics  metrics
                :cards    (into {} (filter #(-> % val :query uses-metric?)) cards)}))))))

(def ^:private card-id-offset
  (quot Long/MAX_VALUE 2))

(defn- process-instance
  [{:keys [metrics cards]}]
  {:v2-metrics
   (for [[id definition :as input] metrics]
     (let [metric {:description "desc of just a metric"
                   :archived false
                   :table_id (:source-table definition)
                   :definition (json/encode definition)
                   :show_in_getting_started false
                   :name "just a metric"
                   :caveats "caveats"
                   :creator_id 2
                   :updated_at #t "2024-05-09T18:38:55.642292Z"
                   :id id
                   :how_is_this_calculated "how this is calculated"
                   :entity_id "RxRTv8Q_qqPFNQHuAjGGo"
                   :created_at #t "2024-05-09T18:38:55.642292Z"
                   :points_of_interest "points of interest"}]
       {:input input
        :metric-card (#'metrics-v2/convert-metric-v2 metric 1)}))
   :cards
   (for [[_ dataset-query :as input] cards]
     {:input input
      :query (#'metrics-v2/rewrite-metric-consuming-query (:query dataset-query)
                                                          (fn [id] (+ id card-id-offset)))})})

(defn- validate-query
  [query context]
  (if (metrics-v2-test/query-validator query)
    query
    (let [error     (metrics-v2-test/query-explainer query)
          humanized (me/humanize error)]
      (throw (ex-info "invalid query"
                      (assoc context
                             :query    query
                             :error    humanized
                             :original error))))))

(defn- collect-metric-refs
  [x]
  (cond
    (metric-ref? x) [(second x)]
    (map? x)        (collect-metric-refs (vals x))
    (sequential? x) (mapcat collect-metric-refs x)
    :else           nil))

(defn- process-instances
  ([] (process-instances nil))
  ([{:keys [print-stats?]}]
   (when print-stats?
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "instance,metrics,metric consuming cards,all cards"))
   (doseq [{instance-name :instance :as instance} (read-instance)]
     (let [{:keys [v2-metrics cards]} (process-instance instance)]
       (when print-stats?
         #_{:clj-kondo/ignore [:discouraged-var]}
         (printf "%s,%d,%d%n" instance-name (count v2-metrics) (count cards)))
       (doseq [{:keys [input metric-card]} v2-metrics
               :let [{:keys [dataset_query]} metric-card
                     parsed-query (json/decode+kw dataset_query)]]
         (testing (str "metric conversion: " (pr-str {:instance instance-name
                                                      :metric {:id (first input)
                                                               :definition (second input)}
                                                      :dataset-query parsed-query}))
           (is (= (mbql.normalize/normalize (second input))
                  (:query (mbql.normalize/normalize parsed-query))))))
       (doseq [{:keys [input query]} cards]
         (testing (str "metric consuming card conversions: "
                       (pr-str {:instance instance-name
                                :input input
                                :query query}))
           (is (= (collect-metric-refs (second input))
                  (map #(- % card-id-offset) (collect-metric-refs query)))))
         (validate-query (-> {:query query} mbql.normalize/normalize :query)
                         {:instance instance-name, :input input}))))
   (when print-stats?
     (flush))))

(when (.canRead (io/file data-file))
  (deftest metabase-cloud-instance-rewrite-test
    (process-instances)))

(comment
  (process-instances {:print-stats? true})
  0)
