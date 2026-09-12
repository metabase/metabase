(ns dev.security-lint.taint-test
  (:require
   [clojure.test :refer :all]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.taint :as taint]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(defn- temp! [src]
  (let [f (doto (java.io.File/createTempFile "seclint" ".clj") .deleteOnExit)]
    (spit f src) (.getAbsolutePath f)))

(def ^:private src
  "(ns t (:require [next.jdbc :as jdbc]))
(def table-name \"events\")
(defn tainted [db user-table]
  (jdbc/execute! db [(format \"select * from %s\" user-table)]))
(defn constant [db]
  (jdbc/execute! db [(format \"select * from %s\" table-name)]))
(defn sanitized [db user-table]
  (jdbc/execute! db [(format \"select * from %s\" (quote-ident user-table))]))
")

(defn- origins-of!
  "Run a probe rule over `src` and return the origin labels the engine reports for the first argument of every
  `(sink ...)` call, by row."
  [src]
  (let [rule {:id :test/origins :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/origins ctx (ast/arg node 0))))})}]
    (into {} (map (juxt :row :message)) (engine/analyze {:paths [(temp! src)] :rules [rule]}))))

(defn- analyze! [detect]
  ;; `:any-local` keeps these focused on sanitizer handling; source policy is covered in request-taint-test.
  (engine/analyze {:paths [(temp! src)]
                   :taint-sources :any-local
                   :rules [{:id :t/x :name "x" :description "d" :severity :error :precision :high :cwe "C"
                            :triggers '#{next.jdbc/execute!} :detect detect}]}))

(deftest tainted-distinguishes-locals-from-vars-test
  (testing "a function parameter reaching the query is tainted; a namespace constant is not"
    (let [findings (analyze! (fn [ctx]
                               (when (taint/tainted? ctx (ast/arg (:node ctx) 1) {:sanitizers []})
                                 {:message "tainted"})))]
      (is (= [4 8] (map :row findings))
          "rows 4 and 8 reach a parameter; row 6 only reaches a def"))))

(deftest sanitizers-neutralize-test
  (testing "a value passed through a quoting function is no longer treated as tainted"
    (let [findings (analyze! (fn [ctx]
                               (when (taint/tainted? ctx (ast/arg (:node ctx) 1))
                                 {:message "tainted"})))]
      (is (= [4] (map :row findings))
          "row 8 wraps the parameter in quote-ident, which the default sanitizers recognize"))))

(deftest sanitizer-name-patterns-test
  (testing "sanitizers can be matched by name pattern, so aliases and namespaces don't have to be enumerated"
    (is (true? (taint/sanitizer? 'semantic.util/quote-ident taint/default-sanitizers)))
    (is (true? (taint/sanitizer? 'h2x/quote-name taint/default-sanitizers)))
    (is (true? (taint/sanitizer? 'driver/sanitize-filename taint/default-sanitizers)))
    (is (false? (taint/sanitizer? 'u/escape-sql taint/default-sanitizers))
        "escaping is not quoting: escape-text, munge-setting-name and normalize-key all cleared taint by name once")
    (is (false? (taint/sanitizer? 'str taint/default-sanitizers)))
    (is (false? (taint/sanitizer? 'format taint/default-sanitizers)))))

(deftest numeric-param-regions-test
  (let [src  "(ns t)
(api.macros/defendpoint :post \"/x/:id\" \"doc\"
  [{:keys [id name]} :- [:map [:id ms/PositiveInt] [:name ms/NonBlankString]]
   {:keys [limit]} :- [:map [:limit [:maybe :int]]]
   {:keys [q]}
   body :- [:map [:x :any]]
   n :- pos-int?]
  nil)"
        node (z/root (z/of-string src {:track-position? true}))
        dp   (first (keep taint/defendpoint-params (ast/find-nodes taint/defendpoint-params node)))
        typed (taint/typed-param-regions dp "f.clj")
        rows (fn [k] (->> (get typed k) (map (juxt :row :col)) set))]
    (testing "only bindings whose schema pins them to a number: id, limit, n"
      (is (= #{[3 12] [4 12] [7 4]} (rows :numeric))))
    (testing "and to a string: name"
      (is (= #{[3 15]} (rows :string))))))

(deftest pinned-union-schema-test
  (let [src  "(ns t)
(api.macros/defendpoint :get \"/:id\" \"doc\"
  [{:keys [id]} :- [:map [:id [:or ms/PositiveInt [:= :root]]]]
   {:keys [kind other]} :- [:map [:kind [:or [:enum :a :b] ms/PositiveInt]] [:other [:or ms/PositiveInt :string]]]]
  nil)"
        node (z/root (z/of-string src {:track-position? true}))
        dp   (first (keep taint/defendpoint-params (ast/find-nodes taint/defendpoint-params node)))
        typed (taint/typed-param-regions dp "f.clj")
        rows (fn [k] (->> (get typed k) (map (juxt :row :col)) set))]
    (testing "a union of pinned schemas is pinned: a number or the literal :root is neither a clause nor a query"
      (is (= #{[3 12] [4 12]} (rows :registry))))
    (testing "a union with a string branch is a string: no clause, but raw SQL in a pk position"
      (is (= #{[4 17]} (rows :string)))
      (is (= #{} (rows :numeric))))))

(deftest conventionally-numeric-locals-test
  (let [rule {:id :test/dyn :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink} :taint-policy :any-local
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (mapv ast/->str (taint/tainted-leaves ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2]))
(defn sink [x] x)
(defn a [card-id ids idx name] (sink [card-id ids idx name]))
(defn b [row] (sink (:card_id row)))
(defn c [row] (let [cid (:card_id row) eid (:entity_id row)] (sink [cid eid])))
(defn d [body] (sink (get-in body [:link :entity :id])))")] :rules [rule]}))]
    (testing "under :any-local, a local named like an id or an index is a number by convention"
      (is (= "[\"name\"]" (get by-row 3))))
    (testing "an id-named key read straight off a row is an integer column; entity_id is a string"
      (is (= "[]" (get by-row 4)))
      (is (= "[\"eid\"]" (get by-row 5))))
    (testing "a nested read is whatever the document holds"
      (is (= "[\"body\"]" (get by-row 6))))))

(deftest stored-id-accessor-test
  (let [rule {:id :test/dyn :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node untyped-locals] :as ctx}]
                        {:message (pr-str (mapv ast/->str (taint/tainted-leaves (assoc ctx :locals untyped-locals) (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(api.macros/defendpoint :post \"/a/:id\" \"doc\" [{:keys [id]} :- [:map [:id ms/PositiveInt]] _q _b]
  (let [dc (t2/select-one :model/DashboardCard id)]
    (sink (:card_id dc))
    (sink (:visualization_settings dc))
    (sink (get-in dc [:visualization_settings :link :entity :id]))))
(api.macros/defendpoint :post \"/b\" \"doc\" [_r _q {:keys [body]}]
  (sink (:card_id body)))
(defn- by-card [card-id] (sink card-id))
(defn- by-stored-card [card-id] (sink card-id))
(api.macros/defendpoint :post \"/c/:id\" \"doc\" [{:keys [id]} :- [:map [:id ms/PositiveInt]] _q {:keys [card_id]}]
  (let [dc (t2/select-one :model/DashboardCard id)]
    (by-card (:card_id dc))
    (by-card card_id)
    (by-stored-card (:card_id dc))))")] :rules [rule]}))]
    (testing "an id column off a stored row is an integer, not an untyped value"
      (is (= "[]" (get by-row 5))))
    (testing "any other column, and anything inside a JSON column, is untyped"
      (is (= "[\"dc\"]" (get by-row 6)))
      (is (= "[\"dc\"]" (get by-row 7))))
    (testing "the same key off an untyped request map is whatever the client sent"
      (is (= "[\"body\"]" (get by-row 9))))
    (testing "an id-named parameter is a foreign key when what it holds is stored, and the client's when the
              client sent it untyped: the union of the two callers is untyped"
      (is (= "[\"card-id\"]" (get by-row 10)))
      (is (= "[]" (get by-row 11))))))

(deftest assertion-validators-test
  (let [by-row (origins-of! "(ns t (:require [metabase.api.macros :as api.macros] [metabase.sso.utils :as sso-utils]))
(defn sink [x] x)
(defn- validate-url! [u] (when-not (str/starts-with? u \"https://\") (throw (ex-info \"no\" {}))))
(api.macros/defendpoint :post \"/a\" \"doc\" [_ _ {:keys [url]}] (validate-url! url) (sink url))
(api.macros/defendpoint :post \"/b\" \"doc\" [_ _ {:keys [url]}] (sink url) (validate-url! url))
(api.macros/defendpoint :post \"/c\" \"doc\" [_ _ {:keys [url]}] (let [u (sso-utils/check-sso-redirect url)] (sink u)))
(api.macros/defendpoint :post \"/d\" \"doc\" [_ _ {:keys [url other]}] (when (seq url) (validate-url! url)
  (sink other)))")]
    (testing "a validating assertion vouches for its argument in the forms that follow it in the same body"
      (is (= "()" (get by-row 4))))
    (testing "not for the forms before it"
      (is (= "(:request)" (get by-row 5))))
    (testing "a validator's return is the validated value"
      (is (= "()" (get by-row 6))))
    (testing "only the argument it was applied to"
      (is (= "(:request)" (get by-row 8))))))

(deftest assertion-validators-order-test
  (let [by-row (origins-of! "(ns t (:require [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- validate-url! [u] u)
(api.macros/defendpoint :post \"/d\" \"doc\" [_ _ {:keys [url]}] (when (seq url) (validate-url! url) (sink url)))")]
    (testing "inside a nested form, the forms after the assertion are vouched for"
      (is (= "()" (get by-row 4))))))

(deftest session-keys-test
  (let [by-row (origins-of! "(ns t (:require [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- handle [request] (let [user-id (:metabase-user-id request) q (:query-string request)]
  (sink user-id)
  (sink q)))
(api.macros/defendpoint :post \"/a\" \"doc\" [_ _ _ request] (handle request))")]
    (testing "the session middleware's keys are the middleware's, not the client's"
      (is (= "()" (get by-row 4))))
    (testing "the rest of the request is still the client's"
      (is (= "(:request)" (get by-row 5))))))

(deftest escaper-as-value-test
  (let [by-row (origins-of! "(ns t (:require [metabase.util.honey-sql-2 :as h2x] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(api.macros/defendpoint :post \"/a\" \"doc\" [_ _ {:keys [tokens]}]
  (let [escaped (map h2x/like-substring tokens)
        raw     (map str tokens)
        threaded (->> tokens (map h2x/like-substring))]
    (sink escaped)
    (sink raw)
    (sink threaded)))")]
    (testing "an escaper applied as a value over a collection escapes what comes out"
      (is (= "()" (get by-row 7)))
      (is (= "()" (get by-row 9))))
    (testing "mapping anything else does not"
      (is (= "(:request)" (get by-row 8))))))

(deftest sanitized-through-a-let-test
  (let [src "(ns t (:require [metabase.util.honey-sql-2 :as h2x]))
(defn f [q]
  (let [wildcard (h2x/quote-ident q)
        raw      (str q \"%\")
        via      raw]
    (vector wildcard raw via)))"
        path (temp! src)
        rule {:id :test/leaf :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :taint-policy :any-local
              :triggers '#{clojure.core/vector}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (mapv ast/->str (taint/tainted-leaves ctx node)))})}
        [f] (engine/analyze {:paths [path] :rules [rule]})]
    (testing "a local bound to a sanitizer's result is clean at its use; one bound to a plain value is not, and
              neither is a local that merely renames it"
      (is (= "[\"raw\" \"via\"]" (:message f))))))

(deftest stored-origins-test
  (let [by-row (origins-of! "(ns t (:require [toucan2.core :as t2] [metabase.driver :as driver] [clj-http.client :as http] [metabase.settings.core :refer [defsetting]]))
(defn sink [x] x)
(defsetting tile-url \"doc\")
(defn a [id] (let [card (t2/select-one :model/Card id)] (sink (:dataset_query card))))
(defn b [driver db] (let [tables (driver/describe-database driver db)] (sink tables)))
(defn c [] (sink (:body (http/get \"https://x\"))))
(defn d [] (sink (tile-url)))
(defn e [] (let [n 5] (sink n)))
(defn f [rows] (doseq [row (t2/select :model/Field)] (sink (:name row))))
(defn g [db] (sink (quote-ident (t2/select-one :model/Card 1))))")]
    (testing "a Toucan read is the application database, refined to the model"
      (is (= "(:app-db/Card)" (get by-row 4)))
      (is (= "(:app-db/Field)" (get by-row 9)) "through a doseq binding"))
    (testing "a driver describe is the warehouse"
      (is (= "(:warehouse)" (get by-row 5))))
    (testing "an HTTP fetch is external, with no binding in between"
      (is (= "(:external)" (get by-row 6))))
    (testing "a setting getter is the application database"
      (is (= "(:app-db/setting)" (get by-row 7))))
    (testing "a literal is nothing"
      (is (= "()" (get by-row 8))))
    (testing "a sanitizer clears it"
      (is (= "()" (get by-row 10))))))

(deftest scalar-setting-test
  (let [by-row (origins-of! "(ns t (:require [metabase.settings.core :refer [defsetting]]))
(defn sink [x] x)
(defsetting page-size \"doc\" :type :integer)
(defsetting tile-url \"doc\")
(defn a [] (sink (page-size)))
(defn b [] (sink (tile-url)))")]
    (testing "a setting typed as a number returns one whatever was stored: no origin"
      (is (= "()" (get by-row 5))))
    (testing "a string setting is a read of the application database"
      (is (= "(:app-db/setting)" (get by-row 6))))))

(deftest declared-origin-test
  (let [by-row (origins-of! "(ns t)
(defn sink [x] x)
(defmulti ^{:taint/source :external} claims (fn [kind _] kind))
(defn a [tok] (let [c (claims :jwt tok)] (sink (:email c))))")]
    (is (= "(:external)" (get by-row 4)) "a marker on the definition makes the function an origin")))

(deftest return-value-origins-test
  (let [by-row (origins-of! "(ns t (:require [toucan2.core :as t2]))
(defn sink [x] x)
(defn- fetch [id] (t2/select-one :model/Card id))
(defn- fetch-with-let [id] (let [c (t2/select-one :model/Card id)] (when c c)))
(defn- fetch-branch [id] (if (pos? id) (t2/select-one :model/Card id) {:name \"none\"}))
(defn- fetch-quiet [id] (t2/select-one :model/Card id) {:name \"none\"})
(defn a [id] (sink (:name (fetch id))))
(defn b [id] (let [card (fetch-with-let id)] (sink card)))
(defn c [id] (sink (fetch-branch id)))
(defn d [id] (sink (fetch-quiet id)))
(defn e [id] (sink (fetch (fetch id))))
(defn- fetch-name [id] (let [{:keys [name]} (t2/select-one :model/Card id)] name))
(defn- fetch-first [id] (let [[c] (t2/select :model/Card id)] c))
(defn f [id] (sink (fetch-name id)))
(defn g [id] (sink (fetch-first id)))")]
    (testing "a function returns what its tail carries, through a let and through both branches of an if"
      (is (= "(:app-db/Card)" (get by-row 7)))
      (is (= "(:app-db/Card)" (get by-row 8)))
      (is (= "(:app-db/Card)" (get by-row 9))))
    (testing "a read that is not in tail position does not leak out"
      (is (= "()" (get by-row 10))))
    (testing "nested calls compose"
      (is (= "(:app-db/Card)" (get by-row 11))))
    (testing "a destructured local is followed to its init like a plain one"
      (is (= "(:app-db/Card)" (get by-row 14)))
      (is (= "(:app-db/Card)" (get by-row 15))))))

(deftest checks-test
  (let [rule {:id :test/checks :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str [(sort (taint/checks ctx (ast/arg node 0)))
                                           (sort (taint/origins ctx (ast/arg node 0)))])})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.common :as api] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- save! [card] (api/write-check card) (sink card))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q {:keys [card_id]}]
  (let [card (api/read-check :model/Card id)]
    (sink card)
    (sink id)
    (sink card_id)
    (save! card_id)
    (sink card_id)))")] :rules [rule]}))]
    (testing "the object a check returns is checked, and read from the application database (and derived from
              the request id, as any binding initialized from one is)"
      (is (= "[(:checked/Card) (:request :app-db/Card)]" (get by-row 6))))
    (testing "the id handed to the check is checked, and still a request value"
      (is (= "[(:checked/Card) (:request)]" (get by-row 7))))
    (testing "a body id checked inside a callee is checked in the caller too, before and after the call"
      (is (= "[(:checked) (:request)]" (get by-row 8)))
      (is (= "[(:checked) (:request)]" (get by-row 10))))))

(deftest let-404-binding-test
  (let [rule {:id :test/checks :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str [(sort (taint/checks ctx (ast/arg node 0)))
                                           (sort (taint/origins ctx (ast/arg node 0)))])})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.common :as api] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q _b]
  (api/let-404 [card (t2/select-one :model/Card id)]
    (api/write-check card)
    (sink card)
    (sink id)))")] :rules [rule]}))]
    (testing "a value bound by let-404 is a binding like any other: it carries what its init read, and a check on
              it vouches for the id that fetched it -- as the model the row was read from, since the check named
              none"
      (is (= "[(:checked :checked/Card) (:request :app-db/Card)]" (get by-row 6)))
      (is (= "[(:checked :checked/Card) (:request)]" (get by-row 7))))))

(deftest check-refined-by-origin-test
  (let [rule {:id :test/checks :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/checks ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.common :as api] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- save! [obj] (api/write-check obj) (sink obj))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q {:keys [body]}]
  (save! (t2/select-one :model/Card id))
  (save! (t2/select-one :model/Dashboard id))
  (save! body)
  (sink id))")] :rules [rule]}))]
    (testing "a check that names no model is refined to the models the checked value was read from; a value
              read from none stays an unnamed check"
      (is (= "(:checked :checked/Card :checked/Dashboard)" (get by-row 3))))
    (testing "and the id that fetched the rows is checked as those models"
      (is (= "(:checked :checked/Card :checked/Dashboard)" (get by-row 8))))))

(deftest sanitizing-functions-test
  (let [by-row (origins-of! "(ns t (:require [honey.sql :as sql] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- table-sql [t] (sql/format {:drop-table (keyword t)} {:quoted true}))
(defn- first-sql [t] (first (sql/format {:drop-table (keyword t)})))
(defn- threaded-sql [t] (-> {:select [:*] :from [(keyword t)]} (sql/format {:quoted true})))
(defn- wrapper [t] (threaded-sql t))
(defn- raw-sql [t] (str \"DROP TABLE \" t))
(defn- branchy [t] (if (seq t) (raw-sql t) (table-sql t)))
(api.macros/defendpoint :post \"/a\" \"doc\" [_ _ {:keys [t]}] (sink (table-sql t)))
(api.macros/defendpoint :post \"/b\" \"doc\" [_ _ {:keys [t]}] (let [s (first-sql t)] (sink s)))
(api.macros/defendpoint :post \"/c\" \"doc\" [_ _ {:keys [t]}] (sink (wrapper t)))
(api.macros/defendpoint :post \"/d\" \"doc\" [_ _ {:keys [t]}] (sink (raw-sql t)))
(api.macros/defendpoint :post \"/e\" \"doc\" [_ _ {:keys [t]}] (let [s (raw-sql t)] (sink s)))
(api.macros/defendpoint :post \"/f\" \"doc\" [_ _ {:keys [t]}] (sink (branchy t)))
(api.macros/defendpoint :post \"/g\" \"doc\" [_ _ {:keys [t]}] (sink (-> {:where [:= :x t]} (sql/format))))
(api.macros/defendpoint :post \"/h\" \"doc\" [_ _ {:keys [t]}] (let [s (-> {:where [:= :x t]} sql/format)] (sink s)))")]
    (testing "a function whose every tail is a sanitizer call sanitizes: directly, through `first`, through a
              thread, and through a wrapper of one"
      (is (= "()" (get by-row 9)))
      (is (= "()" (get by-row 10)))
      (is (= "()" (get by-row 11))))
    (testing "a function that builds SQL by hand does not, and one tail out of two is not enough"
      (is (= "(:request)" (get by-row 12)))
      (is (= "(:request)" (get by-row 13)))
      (is (= "(:request)" (get by-row 14))))
    (testing "a thread that ends in a sanitizer is sanitized whole, at the sink and through a binding"
      (is (= "()" (get by-row 15)))
      (is (= "()" (get by-row 16))))))

(deftest apply-and-mapply-test
  (let [rule {:id :test/checks :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str [(sort (taint/checks ctx (ast/arg node 0)))
                                           (sort (taint/origins ctx (ast/arg node 0)))])})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [medley.core :as m] [metabase.api.common :as api] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- run [{:keys [dashboard card]}] (api/read-check dashboard) (sink card))
(defn- run2 [a b] (api/read-check a) (sink b))
(api.macros/defendpoint :post \"/:id\" \"doc\" [{:keys [id]} _q {:keys [card_id other_id]}]
  (m/mapply run {:dashboard (api/check-404 (t2/select-one :model/Dashboard id)) :card (t2/select-one :model/Card card_id)})
  (sink id)
  (apply run2 (t2/select-one :model/Dashboard other_id) [(t2/select-one :model/Card card_id)])
  (sink other_id))")] :rules [rule]}))]
    (testing "mapply hands the map to the callee's map parameter, key by key: what `card` reads is what the
              caller put under :card"
      (is (= "[() (:request :app-db/Card)]" (get by-row 3))))
    (testing "and a check in the callee vouches for the id in the caller's entry, as the model that entry held"
      (is (= "[(:checked :checked/Dashboard) (:request)]" (get by-row 7))))
    (testing "apply hands its explicit arguments to the leading parameters, and its collection to the last"
      (is (= "[() (:request :app-db/Card)]" (get by-row 4)))
      (is (= "[(:checked :checked/Dashboard) (:request)]" (get by-row 9))))))

(deftest owner-scoped-test
  (let [rule {:id :test/checks :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/checks ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.common :as api] [metabase.api.macros :as api.macros] [metabase.util.log :as log]))
(defn sink [x] x)
(defn- delete-bookmark! [model id user-id] (t2/delete! model :id id :user_id user-id))
(api.macros/defendpoint :delete \"/:model/:id\" \"doc\" [{:keys [model id]} _q _b]
  (delete-bookmark! model id api/*current-user-id*)
  (sink id))
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q {:keys [card_id other_id]}]
  (t2/select-one :model/Bookmark :card_id card_id :user_id api/*current-user-id*)
  (sink card_id)
  (log/info \"looking at\" other_id api/*current-user-id*)
  (sink other_id)
  (sink id))")] :rules [rule]}))]
    (testing "an id handed to a call alongside the current user's id is scoped to that user: authorized by
              construction, through a helper or at the query"
      (is (= "(:checked/owner)" (get by-row 6)))
      (is (= "(:checked/owner)" (get by-row 9))))
    (testing "not by a log line, and not an id the scoped call never saw"
      (is (= "()" (get by-row 11)))
      (is (= "()" (get by-row 12))))))

(deftest map-argument-keys-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node untyped-locals] :as ctx}]
                        {:message (pr-str [(sort (taint/origins ctx (ast/arg node 0)))
                                           (taint/tainted? (assoc ctx :locals untyped-locals) (ast/arg node 0))])})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- go! [{:keys [target file] :as opts}]
  (sink target)
  (sink file)
  (sink opts))
(defn- go-all! [opts] (sink opts))
(api.macros/defendpoint :post \"/:id\" \"doc\" [{:keys [id]} :- [:map [:id ms/PositiveInt]] _q {:strs [file]}]
  (go! {:target id :file (:tempfile file)})
  (go-all! {:target id :file (:tempfile file)}))")] :rules [rule]}))]
    (testing "a map literal handed to a destructuring parameter reaches each key's binding with that entry's
              labels: the id stays a number, the file is untyped"
      (is (= "[(:request) false]" (get by-row 4)))
      (is (= "[(:request) true]" (get by-row 5))))
    (testing "the :as binding, and a plain parameter, hold the whole map"
      (is (= "[(:request) true]" (get by-row 6)))
      (is (= "[(:request) true]" (get by-row 7))))))

(deftest key-scoped-checks-test
  (let [rule {:id :test/kchk :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/checks ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.common :as api] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- create! [body] (api/read-check :model/Card (:card_id body)) (sink body))
(api.macros/defendpoint :post \"/\" \"doc\" [_r _q body]
  (let [cid (:card_id body)]
    (api/read-check :model/Card cid)
    (sink body)
    (create! body)))")] :rules [rule]}))]
    (testing "a check on one key of a map vouches for that key, not the map"
      (is (= "(:checked.card_id/Card)" (get by-row 3)))
      (is (= "(:checked.card_id/Card)" (get by-row 7)) "through a let binding"))))
