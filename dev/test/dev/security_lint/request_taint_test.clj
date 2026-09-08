(ns dev.security-lint.request-taint-test
  "Taint sourced from the request boundary rather than from every local binding."
  (:require
   [clojure.test :refer :all]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.taint :as taint]
   [rewrite-clj.parser :as p]))

(set! *warn-on-reflection* true)

(defn- temp! [src]
  (let [f (doto (java.io.File/createTempFile "seclint" ".clj") .deleteOnExit)]
    (spit f src) (.getAbsolutePath f)))

(def ^:private src
  "(ns t (:require [metabase.api.macros :as api.macros] [next.jdbc :as jdbc]))

(def index-table \"search_index\")

(defn internal-ddl [db]
  (jdbc/execute! db [(format \"drop table %s\" index-table)]))

(defn helper [db some-name]
  (jdbc/execute! db [(format \"drop table %s\" some-name)]))

(api.macros/defendpoint :post \"/run\"
  \"docstring\"
  [_route _query {:keys [table]}]
  (jdbc/execute! nil [(format \"drop table %s\" table)]))
")

(defn- rows! [taint-sources]
  (map :row
       (engine/analyze
        {:paths [(temp! src)]
         :taint-sources taint-sources
         :rules [{:id :t/sql :name "n" :description "d" :severity :error :precision :high :cwe "C"
                  :triggers '#{next.jdbc/execute!}
                  :detect (fn [{:keys [node] :as ctx}]
                            (let [sql (first (ast/children (ast/arg node 1)))]
                              (when (taint/tainted? ctx sql) {:message "tainted"})))}]})))

(deftest any-local-flags-internal-helpers-test
  (testing "treating every local as a source flags internal helpers alongside the endpoint"
    (is (= [9 14] (rows! :any-local))
        "row 9 is an internal helper param, row 14 is the endpoint body")))

(deftest call-graph-sources-only-flag-the-endpoint-test
  (testing "sourcing taint at the request boundary leaves internal helpers alone"
    (is (= [14] (rows! :call-graph))
        "only the defendpoint body, whose value is destructured from the request")))

(deftest namespace-constant-never-tainted-test
  (testing "a def is not a source under either policy"
    (is (not (some #{6} (rows! :any-local))))
    (is (not (some #{6} (rows! :call-graph))))))

(deftest defendpoint-param-vector-test
  (testing "finds the parameter vector past a return schema and docstring"
    (is (= "[_route _query {:keys [table]}]"
           (ast/->str (taint/defendpoint-params
                        (p/parse-string
                         "(api.macros/defendpoint :post \"/x\" :- Schema \"doc\" [_route _query {:keys [table]}] body)")))))
    (is (= "[_route]"
           (ast/->str (taint/defendpoint-params
                        (p/parse-string
                         "(defendpoint :get \"/x\" [_route] body)")))))
    (is (nil? (taint/defendpoint-params
                (p/parse-string "(defn f [x] x)"))))))

(def ^:private cross-fn-src
  "(ns t (:require [ring.util.response :as response]))

(defn- redirect-to-idp [idp redirect]
  (response/redirect (str idp redirect)))

(defn handle-sso [request]
  (let [target (get-in request [:params :redirect])]
    (redirect-to-idp \"https://idp\" target)))
")

(deftest call-graph-crosses-function-boundaries-test
  (let [path (temp! cross-fn-src)
        run  (fn [policy]
               (map :row
                    (engine/analyze
                     {:paths [path]
                      :taint-sources policy
                      :rules [{:id :t/redir :name "n" :description "d" :severity :error :precision :high :cwe "C"
                               :triggers '#{ring.util.response/redirect}
                               :detect (fn [{:keys [node] :as ctx}]
                                         (when (taint/tainted? ctx (ast/arg node 0))
                                           {:message "tainted redirect"}))}]})))]
    (testing ":call-graph follows it from the Ring request through the let and the call"
      (is (= [4] (run :call-graph))))
    (testing ":any-local also flags it, but only because it flags every parameter"
      (is (= [4] (run :any-local))))))

(def ^:private guarded-src
  "(ns t (:require [clojure.java.io :as io] [metabase.api.macros :as api.macros]))

(defn- guarded [session-id]
  (when (re-matches #\"^[a-z0-9-]+$\" (str session-id))
    (io/file \"/data\" (str session-id \".jsonl\"))))

(defn- unguarded [session-id]
  (io/file \"/data\" (str session-id \".jsonl\")))

(api.macros/defendpoint :get \"/x\"
  \"doc\"
  [{:keys [session-id]} _query _body]
  [(guarded session-id) (unguarded session-id)])
")

(deftest validated-value-is-not-reported-test
  (let [path (temp! guarded-src)
        rows (map :row
                  (engine/analyze
                   {:paths [path]
                    :taint-sources :call-graph
                    :rules [{:id :t/path :name "n" :description "d" :severity :error :precision :low :cwe "C"
                             :triggers '#{clojure.java.io/file}
                             :detect (fn [{:keys [node] :as ctx}]
                                       (when (some #(and (ast/dynamic-string? %) (taint/tainted? ctx %))
                                                   (ast/args node))
                                         {:message "path"}))}]}))]
    (testing "an allow-list check retires the finding it protects"
      (is (not (some #{5} rows)) "row 5 is guarded by re-matches"))
    (testing "the same code without the check is still reported"
      (is (some #{8} rows) "row 8 has no guard"))))

(deftest defendpoint-vector-route-test
  (testing "a vector route like [\"/:id/x\" :id #\"\\d+\"] is the route, not the parameter vector"
    (is (= "[{:keys [id]}]"
           (ast/->str (taint/defendpoint-params
                        (p/parse-string "(api.macros/defendpoint :get [\"/:id/x\" :id #\"\\d+\"] \"doc\" [{:keys [id]}] (foo id))"))))))
  (testing "and with a return schema before the docstring"
    (is (= "[_r _q {:keys [uuid]}]"
           (ast/->str (taint/defendpoint-params
                        (p/parse-string "(api.macros/defendpoint :get [\"/:uuid\" :uuid #\".+\"] :- :any \"doc\" [_r _q {:keys [uuid]}] uuid)")))))))

(def ^:private guard-branch-src
  "(ns t (:require [clojure.java.io :as io] [metabase.api.macros :as api.macros]))
(defn- blocklist [name] (when-not (contains? #{\"a\"} name) (io/file \"/r\" (str name \".t\"))))
(defn- else-branch [id] (if (re-matches #\"^d+$\" id) :by-id (io/file \"/r\" (str id \".t\"))))
(defn- then-branch [id] (if (re-matches #\"^d+$\" id) (io/file \"/r\" (str id \".t\")) :nope))
(defn- other-value [fmt path] (when (and (contains? #{:csv} fmt) (seq path)) (io/file (str \"/r/\" path))))
(defn- negated [x] (when (not (contains? #{\"a\"} x)) (io/file \"/r\" (str x \".t\"))))
(defn- under-or [o p] (when (or (re-matches #\"^x$\" o) (seq p)) (io/file (str \"/r/\" p))))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q {:keys [name id fmt path x o p]}]
  [(blocklist name) (else-branch id) (then-branch id) (other-value fmt path) (negated x) (under-or o p)])
")

(deftest guards-vouch-only-for-the-validated-branch-and-value-test
  (let [rows (set (map :row
                       (engine/analyze
                        {:paths [(temp! guard-branch-src)]
                         :taint-sources :call-graph
                         :rules [{:id :t/p :name "n" :description "d" :severity :error :precision :low :cwe "C"
                                  :triggers '#{clojure.java.io/file}
                                  :detect (fn [{:keys [node] :as ctx}]
                                            (when (some #(and (ast/dynamic-string? %) (taint/tainted? ctx %))
                                                        (ast/args node))
                                              {:message "path"}))}]})))]
    (is (contains? rows 2) "when-not runs on validation FAILURE -- must still report")
    (is (contains? rows 3) "the else branch of an if is the unvalidated path")
    (is (not (contains? rows 4)) "the then branch of an if is validated")
    (is (contains? rows 5) "validating fmt says nothing about path")
    (is (contains? rows 6) "a negated membership test is a blocklist, not an allow-list")
    (is (contains? rows 7) "under `or` the validator may not have run")))

(defn- temp-dir! []
  (doto (java.io.File. (System/getProperty "java.io.tmpdir") (str "seclint" (System/nanoTime))) .mkdirs .deleteOnExit))

(defn- spit-file! [^java.io.File dir name src]
  (let [f (java.io.File. dir name)] (.deleteOnExit f) (spit f src) (.getAbsolutePath f)))

(deftest multimethod-implementations-are-reachable-and-tainted-test
  (let [dir (temp-dir!)
        a   (spit-file! dir "a.clj" "(ns a)\n(defmulti run :kind)\n")
        b   (spit-file! dir "b.clj"
                        "(ns b (:require [a] [metabase.api.macros :as api.macros] [ring.util.response :as response]))
(defmethod a/run :redirect [{:keys [url]}] (response/redirect url))
(api.macros/defendpoint :post \"/go\" \"doc\" [_r _q body] (a/run body))")
        run (fn [policy]
              (engine/analyze
               {:paths [a b] :taint-sources policy :root (.getAbsolutePath dir)
                :rules [{:id :t/redir :name "n" :description "d" :severity :error :precision :high :cwe "C"
                         :triggers '#{ring.util.response/redirect} :tainted-arg 0
                         :detect (fn [{:keys [tainted?]}] (when tainted? {:message "t"}))}]}))]
    (testing "a call to the multimethod reaches the implementation and taints its parameter"
      (is (= [2] (map :row (run :call-graph)))
          "the :redirect implementation in b.clj, whose destructured url came through the endpoint body"))
    (testing "and the implementation is marked reachable from the endpoint"
      (is (every? :endpoint-reachable? (run :call-graph))))))
