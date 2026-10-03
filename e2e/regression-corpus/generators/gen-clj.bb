#!/usr/bin/env bb
(require '[rewrite-clj.zip :as z]
         '[babashka.fs :as fs]
         '[cheshire.core :as json]
         '[clojure.string :as str])

(def repo-root
  (or (System/getenv "REPO_ROOT")
      (str (fs/normalize (fs/path (fs/parent (fs/absolutize *file*)) ".." ".." "..")))))

(def worktree (or (System/getenv "CORPUS_WORKTREE") repo-root))

(defn line-starts [s]
  (loop [i 0 acc [0]]
    (let [j (str/index-of s "\n" i)]
      (if j (recur (inc j) (conj acc (inc j))) acc))))

(defn children [zloc]
  (when-let [c (z/down zloc)]
    (take-while some? (iterate z/right c))))

(defn sym-str [zloc]
  (when (and zloc (= :token (z/tag zloc)))
    (let [v (try (z/sexpr zloc) (catch Exception _ nil))]
      (when (symbol? v) (str v)))))

(defn head [zloc]
  (when (= :list (z/tag zloc)) (sym-str (z/down zloc))))

(defn kw? [zloc]
  (and (= :token (z/tag zloc))
       (keyword? (try (z/sexpr zloc) (catch Exception _ nil)))))

(def let-like #{"let" "when-let" "when-some" "binding" "with-open" "loop" "when-first" "t2/with-transaction"
                "mdb/with-transaction" "with-redefs" "u/with-timeout" "lib.util.match/match-lite"})
(def when-like #{"when" "when-not"})
(def fn-like #{"fn" "fn*"})
(def defn-like #{"defn" "defn-" "mu/defn" "mu/defn-" "mr/def" "methodical/defmethod"})
(def endpoint-like #{"api.macros/defendpoint" "api/defendpoint" "defendpoint"})

(defn args-vector-index [cs from]
  (loop [i from]
    (when (< i (count cs))
      (let [c (nth cs i)
            prev (when (pos? i) (nth cs (dec i)))]
        (cond
          (and (= :vector (z/tag c)) (not (and prev (= ":-" (z/string prev))))) i
          (= :list (z/tag c)) nil
          :else (recur (inc i)))))))

(defn body-start [zloc]
  (let [h (head zloc)
        cs (vec (children zloc))]
    (cond
      (nil? h) nil
      (= h "do") 1
      (let-like h) 2
      (when-like h) 2
      (fn-like h) (some-> (args-vector-index cs 1) inc)
      (defn-like h) (some-> (args-vector-index cs 2) inc)
      (endpoint-like h) (some-> (args-vector-index cs 3) inc)
      (#{"defmethod" "mu/defmethod"} h) (some-> (args-vector-index cs (if (= :vector (some-> (get cs 2) z/tag)) 3 3)) inc)
      :else nil)))

(def skip-heads #{"comment" "assert" "log/debug" "log/debugf" "log/trace" "log/tracef" "log/info" "log/infof"
                  "log/warn" "log/warnf" "log/error" "log/errorf" "tracing/with-span" "println" "prn"})

(def not-wiring-re #"(^|/)(check|read-check|write-check|assert|validate|throw|when|when-not|if|if-not|cond|let|do|comment)|check-|-check$|^mu/|^s/")

(def cache-re #"(?i)(clear|invalidate|reset|evict|flush|refresh|restore).*(cache|memo)|memo-clear|cache.*(clear|invalidate|reset|evict)|^invalidate|clear-cache")

(defn span [zloc] (z/position-span zloc))

(defn ->offset [starts [row col]] (+ (nth starts (dec row)) (dec col)))

(defn snippet [s n]
  (let [flat (str/trim (str/replace s #"\s+" " "))]
    (if (> (count flat) n) (str (subs flat 0 (dec n)) "…") flat)))

(defn removal-edit [starts prev zloc]
  (let [[_ end] (span zloc)
        [_ prev-end] (span prev)]
    {:start (->offset starts prev-end) :end (->offset starts end) :replacement ""}))

(defn element-removal [starts cs i]
  (let [c (nth cs i)
        [start end] (span c)]
    (cond
      (pos? i) {:start (->offset starts (second (span (nth cs (dec i))))) :end (->offset starts end) :replacement ""}
      (< (inc i) (count cs)) {:start (->offset starts start) :end (->offset starts (first (span (nth cs (inc i))))) :replacement ""}
      :else {:start (->offset starts start) :end (->offset starts end) :replacement ""})))

(defn pair-removal [starts cs i]
  (let [k (nth cs i)
        v (nth cs (inc i))
        [kstart _] (span k)
        [_ vend] (span v)]
    (cond
      (pos? i) {:start (->offset starts (second (span (nth cs (dec i))))) :end (->offset starts vend) :replacement ""}
      (< (+ i 2) (count cs)) {:start (->offset starts kstart) :end (->offset starts (first (span (nth cs (+ i 2))))) :replacement ""}
      :else {:start (->offset starts kstart) :end (->offset starts vend) :replacement ""})))

(defn candidate [file zloc op stratum description priority edit]
  (let [[[row _] [end-row _]] (span zloc)]
    {:operator op :stratum stratum :file file :line row :end_line end-row
     :description description :priority priority :edit edit}))

(defn enclosing-def [zloc]
  (loop [z zloc]
    (let [up (z/up z)]
      (cond
        (nil? up) nil
        (nil? (z/up up)) (str (head z) " " (some-> z z/down z/right z/string))
        :else (recur up)))))

(defn body-calls [file text starts zloc]
  (when-let [start (body-start zloc)]
    (let [cs (vec (children zloc))
          n (count cs)]
      (for [i (range start (dec n))
            :let [c (nth cs i)
                  h (head c)]
            :when (and h (not (skip-heads h)) (not (str/starts-with? h "log/"))
                       (not (re-find not-wiring-re h)))]
        (let [cache? (re-find cache-re h)
              text (z/string c)]
          (candidate file c
                     (if cache? "drop-refetch" "remove-call")
                     (if cache? "state" "wiring")
                     (str (if cache? "Remove cache clear " "Remove call ") "`" (snippet text 70) "` in " (enclosing-def zloc))
                     (cond cache? 3
                           (re-find #"!$|publish|register|subscribe|add-|track" h) 3
                           :else 1)
                     (removal-edit starts (nth cs (dec i)) c)))))))

(defn tail-keys [zloc]
  (let [h (head zloc)
        cs (vec (children zloc))]
    (cond
      (= :map (z/tag zloc)) [[:map zloc]]
      (nil? h) []
      (or (let-like h) (when-like h) (#{"do" "u/prog1" "try"} h))
      (if (= h "u/prog1") (tail-keys (nth cs 1)) (tail-keys (peek (vec (remove #(#{"catch" "finally"} (head %)) cs)))))
      (#{"if" "if-not" "if-let" "if-some"} h) (mapcat tail-keys (subvec cs 2))
      (= h "cond") (mapcat tail-keys (take-nth 2 (drop 2 cs)))
      (#{"->" "cond->"} h) (concat (tail-keys (nth cs 1))
                                   (for [step (drop 2 cs)
                                         :when (= "assoc" (head step))]
                                     [:assoc step]))
      (= h "assoc") [[:assoc zloc]]
      (= h "merge") (mapcat tail-keys (rest cs))
      :else [])))

(defn rename-kw [k]
  (let [s (z/string k)]
    (str s (subs s (dec (count s))))))

(defn endpoint-renames [file starts zloc]
  (when (endpoint-like (head zloc))
    (let [cs (vec (children zloc))
          route (str (z/string (nth cs 1)) " " (z/string (nth cs 2)))]
      (for [[kind node] (tail-keys (peek cs))
            :let [kcs (vec (children node))
                  key-idxs (if (= kind :map) (range 0 (count kcs) 2) (range 2 (count kcs) 2))]
            i key-idxs
            :let [k (nth kcs i)]
            :when (kw? k)]
        (let [[s e] (span k)]
          (candidate file k "rename-key" "wiring"
                     (str "Endpoint " route " returns `" (rename-kw k) "` instead of `" (z/string k) "`")
                     3
                     {:start (->offset starts s) :end (->offset starts e) :replacement (rename-kw k)}))))))

(def persist-heads #{"t2/update!" "t2/insert!" "t2/insert-returning-instance!" "t2/insert-returning-instances!"
                     "t2/insert-returning-pk!" "t2/insert-returning-pks!" "t2/save!" "t2/update-returning-pks!"})

(defn descendants [zloc]
  (cons zloc (mapcat descendants (children zloc))))

(defn persist-head? [h]
  (and h (or (persist-heads h) (re-find #"(^|/)(update|save|insert|create)[\w-]*!$" h))))

(defn persist-drops [file starts zloc]
  (when (persist-head? (head zloc))
    (let [call (snippet (z/string zloc) 40)]
      (concat
       (for [d (rest (descendants zloc))
             :when (= :map (z/tag d))
             :let [cs (vec (children d))]
             i (range 0 (dec (count cs)) 2)
             :when (kw? (nth cs i))]
         (candidate file (nth cs i) "drop-persisted-field" "state"
                    (str "Drop `" (z/string (nth cs i)) "` from the map written by `" call "`")
                    3 (pair-removal starts cs i)))
       (for [d (rest (descendants zloc))
             :when (= "select-keys" (head d))
             :let [v (nth (vec (children d)) 2 nil)]
             :when (and v (= :vector (z/tag v)))
             :let [cs (vec (children v))]
             i (range (count cs))
             :when (kw? (nth cs i))]
         (candidate file (nth cs i) "drop-persisted-field" "state"
                    (str "Drop `" (z/string (nth cs i)) "` from the keys written by `" call "`")
                    3 (element-removal starts cs i)))))))

(defn file-candidates [file]
  (let [text (slurp (str worktree "/" file))
        starts (line-starts text)
        root (z/of-string text {:track-position? true})]
    (->> (iterate z/next root)
         (take-while (complement z/end?))
         (filter #(= :list (z/tag %)))
         (remove #(some-> (enclosing-def %) (str/includes? ":cljs")))
         (mapcat (fn [zloc]
                   (concat (body-calls file text starts zloc)
                           (endpoint-renames file starts zloc)
                           (persist-drops file starts zloc))))
         (distinct)
         vec)))

(println (json/generate-string (vec (mapcat file-candidates *command-line-args*))))
