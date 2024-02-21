(ns metabase.search.trigram
  (:require
   [clojure.string :as str]
   [metabase.api.search :as api.search]
   [metabase.db.query :as mdb.query]
   [metabase.search.config :as search.config]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]
   [clojure.set :as set]
   [medley.core :as m]))

(defn trigrams [s]
  (-> s
      u/lower-case-en
      (str/replace #"[^\w\s]" "")
      (str/replace #"\s+" " ")
      (->>
        (partition 3 1)
        (map (partial apply str)))))

(def models #{"action"
              "card"
              "collection"
              "dashboard"
              "database"
              ;;"dataset"
              "indexed-entity"
              "metric"
              "segment"
              "table"})

(defn collect-model-q [model]
  (let [{:keys [db-model alias]} (get search.config/model-to-db-model model)]
    {:from   [[(t2/table-name db-model) alias]]
     :select (->> (#'api.search/select-clause-for-model model)
                  (filterv (fn check [f]
                             (cond
                               (keyword? f) (str/starts-with? (str f) (str alias "."))
                               (vector? f)  (or (= :model (second f))
                                                (check (first f)))
                               :else        true))))}))

(defn- add-collection-join-and-where-clauses [q]
  (if-let [field (first (filter #(when (keyword? %) (str/ends-with? (name %) ".collection_id")) (:select q)))]
    (-> q
        (api.search/add-collection-join-and-where-clauses field {:search-string      "q"
                                                                 :archived?          false
                                                                 :current-user-perms #{"/"}
                                                                 :models             #{}})
        (update :select conj [:collection.name :collection_name]))
    q))

(defn fetch-model [model]
  (let [collect-q (-> (collect-model-q model)
                      add-collection-join-and-where-clauses)
        q         (mdb.query/format-sql (first (mdb.query/compile collect-q)))]
    (try
      (let [res (-> (mdb.query/reducible-query q)
                    t2.realize/realize)]
        (prn model (count res))
        res)
      (catch Exception e
        (throw (ex-info "wtf" {:model model :query collect-q} e))))))

(defmulti make-model-string (fn [data] (or (:type data) (:model data))))

(defmethod make-model-string "dashboard" [m]
  (str "Dashboard of " (:name m) " " (:description m)))

(defmethod make-model-string "model" [m]
  (str "Model of " (:name m) " " (:description m)))

(defmethod make-model-string "question" [m]
  (str "Question of " (:name m) " " (:description m)))


(def DATA
  (delay
    (m/index-by :id
                (into [] cat (for [m    models
                                   :let [s-q (collect-model-q m)
                                         q (mdb.query/format-sql (first (mdb.query/compile s-q)))]]
                               (try
                                 (let [res (-> (mdb.query/reducible-query q)
                                               t2.realize/realize)]
                                   (prn m (count res))
                                   res)
                                 (catch Exception e
                                     (throw (ex-info "wtf" {:model m :query s-q} e)))))))))
(def INDEX
  (delay
    (reduce
     (fn [acc [k v]]
       (update acc k (fnil conj #{}) v))
     {}
     (for [[_ x] @DATA
           [_ v] x
           :when (string? v)
           t     (trigrams v)]
       [t (:id x)]))))


(defn match [input]
  (for [id (apply set/intersection
                  (for [word (str/split input #"\s+")
                        t    (trigrams word)]
                    (get @INDEX t)))]
    ((juxt :model :name) (get @DATA id))))

(comment
  (#'api.search/select-clause-for-model "card")
  (-> (collect-model-q "card")
      (mdb.query/compile)
      first
      mdb.query/format-sql
      mdb.query/reducible-query
      t2.realize/realize))
