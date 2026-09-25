(ns spike
  "Phase A spike for PLAN_001_store.md. Each check runs against a fresh db file; run each in its own JVM,
  several crash it (see the UPDATE / distance findings):

    cd native/vec1/spike
    clojure -M -m spike basic
    for t in update-vector select-distance-no-query; do clojure -M -m spike $t; done"
  (:require [clojure.java.io :as io]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs])
  (:import (java.nio ByteBuffer ByteOrder)
           (java.sql Connection DriverManager)
           (org.sqlite SQLiteConfig)))

(set! *warn-on-reflection* true)

(def ext
  "Run from native/vec1/spike. Override with VEC1_EXT for other platforms."
  (or (System/getenv "VEC1_EXT")
      (.getAbsolutePath (io/file "../../../resources/vec1/darwin-aarch64/vec1.dylib"))))
(def ^:dynamic *db* nil)

(defn delete-db! [f] (doseq [s ["" "-wal" "-shm" "-journal"]] (io/delete-file (str f s) true)))

(defn open ^Connection []
  (let [cfg  (doto (SQLiteConfig.) (.enableLoadExtension true))
        conn (DriverManager/getConnection (str "jdbc:sqlite:" *db*) (.toProperties cfg))]
    (with-open [st (.createStatement conn)]
      (.execute st (format "select load_extension('%s')" ext)))
    conn))

(defn blob ^bytes [xs]
  (let [b (.order (ByteBuffer/allocate (* 4 (count xs))) (ByteOrder/nativeOrder))]
    (doseq [x xs] (.putFloat b (float x)))
    (.array b)))

(def opts {:builder-fn rs/as-unqualified-lower-maps})
(defn q [conn sp] (jdbc/execute! conn sp opts))
(defn x! [conn sp] (jdbc/execute! conn sp))
(defn unit [d i] (assoc (vec (repeat d 0.0)) i 1.0))
(defn rnd [^java.util.Random r d] (vec (repeatedly d #(.nextGaussian r))))

(defn knn
  ([conn v k] (knn conn v k nil []))
  ([conn v k where params]
   (q conn (into [(str "select rowid, distance, model, archived from search_vec(?, '{k: " k "}')"
                       (when where (str " where " where)))
                  (blob v)] params))))

(defn create! [conn]
  (x! conn ["create virtual table search_vec using vec1(vector, model, archived)"])
  (x! conn ["insert into search_vec(cmd, arg) values ('rebuild', '{index:\"flat\", distance:\"cos\"}')"]))

(defn ins! [conn rowid v model archived]
  (x! conn ["insert into search_vec(rowid, vector, model, archived) values (?, ?, ?, ?)" rowid (blob v) model archived]))

(defn try* [f] (try (f) (catch Throwable t {:error (ex-message t)})))
(defn ids [rows] (mapv :rowid rows))

(def d 8)
(defn seed4! [c]
  (create! c)
  (ins! c 10 (unit d 0) "card" 0)
  (ins! c 11 (unit d 1) "card" 0)
  (ins! c 12 (mapv - (unit d 0)) "card" 0)
  (ins! c 13 (assoc (unit d 0) 0 0.6 1 0.8) "dashboard" 1))

(defmulti check (fn [n _] n))

(defmethod check "basic" [_ c]
  (seed4! c)
  {:info (q c ["select vec1_info() i"]) :knn (knn c (unit d 0) 4)})

(defmethod check "delete-reinsert" [_ c]
  (seed4! c)
  (let [del (x! c ["delete from search_vec where rowid = 10"])
        a   (ids (knn c (unit d 0) 4))
        _   (ins! c 10 (unit d 0) "card" 0)
        b   (ids (knn c (unit d 0) 4))
        dup (try* #(ins! c 10 (unit d 0) "card" 0))]
    {:delete del :after-delete a :after-reinsert b :insert-duplicate-rowid dup}))

(defmethod check "select-plain" [_ c]
  (seed4! c)
  {:by-rowid (try* #(q c ["select rowid, model, archived from search_vec where rowid = 11"]))})

(defmethod check "update-vector" [_ c]
  (seed4! c)
  {:update (try* #(x! c ["update search_vec set vector = ? where rowid = 11" (blob (unit d 0))]))
   :knn (knn c (unit d 0) 4)})

(defmethod check "update-meta" [_ c]
  (seed4! c)
  {:update (try* #(x! c ["update search_vec set archived = 1 where rowid = 11"]))
   :knn (knn c (unit d 0) 4)})

(defmethod check "update-all-cols" [_ c]
  (seed4! c)
  {:update (try* #(x! c ["update search_vec set vector = ?, model = 'card', archived = 1 where rowid = 11" (blob (unit d 0))]))
   :knn (knn c (unit d 0) 4)})

;; 50 cards clustered near e0, 50 dashboards near e1. Query e0 with model = 'dashboard', k 5.
(defn seed-clusters! [c]
  (create! c)
  (let [r (java.util.Random. 42)]
    (jdbc/with-transaction [tx c]
      (doseq [i (range 50)]
        (ins! tx (inc i) (mapv + (unit d 0) (map #(* 0.05 %) (rnd r d))) "card" (mod i 2))
        (ins! tx (+ 101 i) (mapv + (unit d 1) (map #(* 0.05 %) (rnd r d))) "dashboard" (mod i 2))))))

(defmethod check "meta-filter" [_ c]
  (seed-clusters! c)
  (let [f (fn [where params] (try* #(let [rows (knn c (unit d 0) 5 where params)]
                                      {:n (count rows) :rows (mapv (juxt :rowid :model :archived) rows)})))]
    {:no-filter          (f nil [])
     :model-eq-dashboard (f "model = ?" ["dashboard"])
     :model-and-archived (f "model = ? and archived = ?" ["dashboard" 0])
     :archived-gt        (f "archived > ?" [0])
     :model-in           (f "model in ('dashboard', 'card')" [])
     :model-in-dash-only (f "model in ('dashboard')" [])
     :model-in-2         (f "model in ('dashboard', 'metric')" [])
     :model-ne           (f "model != 'card'" [])}))

(defmethod check "k-vs-limit" [_ c]
  (seed-clusters! c)
  {:limit-only   (try* #(count (q c ["select rowid, distance from search_vec(?) limit 3" (blob (unit d 0))])))
   :empty-json   (try* #(count (q c ["select rowid, distance from search_vec(?, '{}') limit 3" (blob (unit d 0))])))
   :k-and-limit  (try* #(count (q c ["select rowid, distance from search_vec(?, '{k: 10}') limit 3" (blob (unit d 0))])))
   :k-only       (try* #(count (q c ["select rowid, distance from search_vec(?, '{k: 7}')" (blob (unit d 0))])))
   :join-doc     (try* #(do (x! c ["create table doc (id integer primary key, name text)"])
                            (x! c ["insert into doc select value, 'doc ' || value from generate_series(1, 200)"])
                            (q c ["select v.rowid, v.distance, d.name from search_vec(?, '{k: 3}') v join doc d on d.id = v.rowid order by v.distance" (blob (unit d 0))])))})

(defmethod check "tx-reopen" [_ c]
  (create! c)
  (jdbc/with-transaction [tx c]
    (doseq [i (range 100)] (ins! tx (inc i) (assoc (unit d (mod i d)) 7 (* 0.01 i)) "card" 0)))
  (let [before (count (knn c (unit d 3) 100))]
    (.close ^Connection c)
    (let [c2 (open)
          after (knn c2 (unit d 3) 3)]
      (jdbc/with-transaction [tx c2]
        (ins! tx 999 (unit d 3) "card" 0)
        (.rollback ^Connection tx))
      {:before-close before :after-reopen (ids after)
       :after-rollback-top (ids (knn c2 (unit d 3) 1))
       :count (q c2 ["select count(*) n from search_vec_base"])})))

(defmethod check "timing" [_ c]
  (create! c)
  (let [r (java.util.Random. 1) dim 384 n 5000
        vs (vec (repeatedly n #(rnd r dim)))
        t0 (System/nanoTime)]
    (doseq [batch (partition-all 100 (map-indexed vector vs))]
      (jdbc/with-transaction [tx c]
        (doseq [[i v] batch] (ins! tx (inc i) v (if (even? i) "card" "dashboard") 0))))
    (let [ins-ms (/ (- (System/nanoTime) t0) 1e6)
          qs (vec (repeatedly 20 #(rnd r dim)))
          t1 (System/nanoTime)
          _ (doseq [v qs] (knn c v 50))
          knn-ms (/ (- (System/nanoTime) t1) 1e6 20)
          t2 (System/nanoTime)
          _ (doseq [v qs] (knn c v 50 "model = ?" ["card"]))
          knn-f-ms (/ (- (System/nanoTime) t2) 1e6 20)]
      {:n n :dim dim :insert-total-ms (long ins-ms) :knn-avg-ms knn-ms :knn-filtered-avg-ms knn-f-ms
       :file-bytes (.length (io/file *db*))})))

(defn -main [& names]
  (doseq [n names]
    (binding [*db* (str (System/getProperty "java.io.tmpdir") "/vec1-spike-" n ".db")]
      (delete-db! *db*)
      (with-open [c (open)]
        (prn n (check n c))
        (flush)))))

(defmethod check "select-distance-no-query" [_ c]
  (seed4! c)
  {:r (try* #(q c ["select rowid, distance from search_vec where rowid = 11"]))})

(defmethod check "select-vector-no-query" [_ c]
  (seed4! c)
  {:r (try* #(count (:vector (first (q c ["select rowid, vector from search_vec where rowid = 11"])))))})

(defmethod check "join-doc" [_ c]
  (seed-clusters! c)
  (x! c ["create table doc (id integer primary key, name text, archived int)"])
  (x! c ["with recursive s(v) as (select 1 union all select v+1 from s where v < 200) insert into doc select v, 'doc ' || v, v % 2 from s"])
  (let [v (blob (unit d 0))]
    {:join-k3        (try* #(mapv (juxt :rowid :name) (q c ["select v.rowid, v.distance, d.name from search_vec(?, '{k: 3}') v join doc d on d.id = v.rowid order by v.distance" v])))
     :join-limit-only (try* #(count (q c ["select v.rowid from search_vec(?) v join doc d on d.id = v.rowid order by v.distance limit 3" v])))
     :join-meta-and-doc-filter (try* #(mapv (juxt :rowid :model :archived) (q c ["select v.rowid, v.model, d.archived from search_vec(?, '{k: 5}') v join doc d on d.id = v.rowid where v.model = 'dashboard' and d.archived = 0 order by v.distance" v])))
     :no-k-no-limit  (try* #(count (q c ["select rowid from search_vec(?)" v])))
     :k-500-of-100   (try* #(count (q c ["select rowid from search_vec(?, '{k: 500}')" v])))}))

(defmethod check "distance-no-index" [_ c]
  ;; same as select-distance-no-query, but the table is never rebuilt into a flat index (index:"none")
  (x! c ["create virtual table search_vec using vec1(vector, model, archived)"])
  (ins! c 11 (unit d 1) "card" 0)
  {:r (try* #(q c ["select rowid, distance from search_vec where rowid = 11"]))})

(defmethod check "update-no-index" [_ c]
  (x! c ["create virtual table search_vec using vec1(vector, model, archived)"])
  (ins! c 10 (unit d 0) "card" 0)
  (ins! c 11 (unit d 1) "card" 0)
  {:update (try* #(x! c ["update search_vec set vector = ? where rowid = 11" (blob (unit d 0))]))
   :knn (try* #(knn c (unit d 0) 2))})
