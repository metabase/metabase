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
  (let [by-row (origins-of! "(ns t (:require [toucan2.core :as t2] [metabase.driver :as driver] [clj-http.client :as http] [buddy.sign.jwt :as jwt] [metabase.settings.core :refer [defsetting]]))
(defn sink [x] x)
(defsetting tile-url \"doc\")
(defn a [id] (let [card (t2/select-one :model/Card id)] (sink (:dataset_query card))))
(defn b [driver db] (let [tables (driver/describe-database driver db)] (sink tables)))
(defn c [] (sink (:body (http/get \"https://x\"))))
(defn d [] (sink (tile-url)))
(defn e [] (let [n 5] (sink n)))
(defn f [rows] (doseq [row (t2/select :model/Field)] (sink (:name row))))
(defn g [db] (sink (quote-ident (t2/select-one :model/Card 1))))
(defn h [tok] (let [claims (jwt/unsign tok \"secret\")] (sink (:groups claims))))")]
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
      (is (= "()" (get by-row 10))))
    (testing "a JWT's claims were written by whoever holds the signing key: an identity provider, an embedding
              application -- outside the instance"
      (is (= "(:external)" (get by-row 11))))))

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

(deftest shape-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str [(sort (taint/shape ctx (ast/arg node 0)))
                                           (sort (taint/origins ctx (ast/arg node 0)))])})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- keyed! [m] (sink m))
(defn- opaque! [m] (sink m))
(defn- mixed! [m] (sink m))
(defn- computed-key! [m] (sink m))
(defn- selected! [m] (sink m))
(defn- threaded! [m] (sink m))
(defn- merged! [m] (sink m))
(defn- inner! [m] (sink m))
(defn- outer! [m] (inner! m))
(defn- composed! [{:keys [name]}] (inner! {:name name}))
(defn- bound! [m] (sink m))
(defn- rebound! [m] (sink m))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body]
  (keyed! {:name (:name body) :id id})
  (opaque! body)
  (mixed! {:name (:name body)})
  (mixed! body)
  (computed-key! (let [k (:key body)] {k 1}))
  (selected! (select-keys body [:name]))
  (->> {:name (:name body)} (assoc :id id) fill-in threaded!)
  (-> {:name (:name body)} (merge body) merged!)
  (outer! {:name (:name body)})
  (composed! body)
  (let [m {:name (:name body)}] (bound! m))
  (let [m body, m2 m] (rebound! m2))
  (sink body))")] :rules [rule]}))]
    (testing "every caller passed a map literal with keyword keys: the code chose the keys, whatever the values"
      (is (= "[(:shape/keyed) (:request)]" (get by-row 3))))
    (testing "every caller passed something else"
      (is (= "[(:shape/opaque) (:request)]" (get by-row 4))))
    (testing "callers disagree: both, and a rule about keys must treat it as opaque"
      (is (= "[(:shape/keyed :shape/opaque) (:request)]" (get by-row 5))))
    (testing "a map whose key is a value is opaque"
      (is (= "[(:shape/opaque) (:request)]" (get by-row 6))))
    (testing "`select-keys` with literal keys is keyed"
      (is (= "[(:shape/keyed) (:request)]" (get by-row 7))))
    (testing "a threaded map literal keeps its shape through steps that keep its keys"
      (is (= "[(:shape/keyed) (:request)]" (get by-row 8))))
    (testing "and loses it at a step that merges another map in"
      (is (= "[(:shape/opaque) (:request)]" (get by-row 9))))
    (testing "a bare parameter handed on carries the shape its own callers gave it; a map built from a parameter's
              fields is keyed however the parameter was shaped, so inner! sees keyed from both"
      (is (= "[(:shape/keyed) (:request)]" (get by-row 10))))
    (testing "a local bound to a keyed literal and handed on is keyed; one bound, through another, to a request map
              is opaque"
      (is (= "[(:shape/keyed) (:request)]" (get by-row 13)))
      (is (= "[(:shape/opaque) (:request)]" (get by-row 14))))
    (testing "a request parameter itself was handed in by no call: no shape, and the shape labels are not origins"
      (is (= "[() (:request)]" (get by-row 28))))))

(deftest shape-terms-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/shape ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- row [id] {:id id :name \"x\"})
(defn- row-or-nil [id] (when id (let [r {:id id}] r)))
(defn- passthrough [m] m)
(defn- threaded! [m] (sink m))
(defn- merged-keyed! [m] (sink m))
(defn- merged-opaque! [m] (sink m))
(defn- assoced! [m] (sink m))
(defn- rows-for! [ms] (sink ms))
(defn- rows-map! [ms] (sink ms))
(defn- rows-fn! [ms] (sink ms))
(defn- rows-concat! [ms] (sink ms))
(defn- rows-opaque! [ms] (sink ms))
(defn- returned! [m] (sink m))
(defn- returned-opaque! [m] (sink m))
(defn- branches! [m] (sink m))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body]
  (threaded! (cond-> {:id id} (:x body) (assoc :x (:x body))))
  (let [pii (select-keys body [:name])]
    (merged-keyed! (merge {:id id} pii))
    (merged-opaque! (merge {:id id} body)))
  (assoced! (assoc body :id id))
  (rows-for! (for [i [1 2] :when i] {:id i}))
  (rows-map! (map row [1 2]))
  (rows-fn! (mapv (fn [i] {:id i}) [1 2]))
  (rows-concat! (concat (for [i [1]] {:id i}) (map #(row %) [2])))
  (rows-opaque! (map #(merge % body) [{:id 1}]))
  (returned! (row-or-nil id))
  (returned-opaque! (passthrough body))
  (branches! (if id {:id id} (select-keys body [:name]))))")] :rules [rule]}))]
    (testing "a threading form seeded with a literal, through steps that keep its keys"
      (is (= "(:shape/keyed)" (get by-row 6))))
    (testing "`merge` is keyed when every argument is -- a literal and a `select-keys` local -- and opaque when
              one is a request map"
      (is (= "(:shape/keyed)" (get by-row 7)))
      (is (= "(:shape/opaque)" (get by-row 8))))
    (testing "`assoc` keeps its map's shape"
      (is (= "(:shape/opaque)" (get by-row 9))))
    (testing "a collection of maps has its element's shape: a `for` body, a named function's return, a `fn` body,
              a `concat` of those"
      (is (= "(:shape/keyed)" (get by-row 10)))
      (is (= "(:shape/keyed)" (get by-row 11)))
      (is (= "(:shape/keyed)" (get by-row 12)))
      (is (= "(:shape/keyed)" (get by-row 13)))
      (is (= "(:shape/opaque)" (get by-row 14))))
    (testing "a function's return has the shape of its tails, a nil branch and a `let` looked through; a
              parameter handed back has what its callers gave"
      (is (= "(:shape/keyed)" (get by-row 15)))
      (is (= "(:shape/opaque)" (get by-row 16))))
    (testing "an `if` is keyed when both branches are"
      (is (= "(:shape/keyed)" (get by-row 17))))))

(deftest shape-through-comprehensions-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/shape ctx (ast/arg node 0))))})}
        ;; the undo pattern: a map of maps of literal rows built with `u/for-map` in one function, taken apart
        ;; with `[k v]` destructuring in a `for` in another, merged with a literal, and handed to the write.
        ;; Each case hands its rows to a function of its own, since it is a *parameter's* shape that is
        ;; evaluated from the argument's term.
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.macros :as api.macros] [metabase.util :as u]))
(defn sink [x] x)
(defn- nested-rows! [rows] (sink rows))
(defn- flat-rows! [rows] (sink rows))
(defn- into-rows! [rows] (sink rows))
(defn- vals-rows! [rows] (sink rows))
(defn- doseq-row! [row] (sink row))
(defn- whole-map! [m] (sink m))
(defn- opaque-rows! [rows] (sink rows))
(defn- let-rows! [rows] (sink rows))
(defn- nested! [table->pk->values]
  (nested-rows! (for [[table-id updates] table->pk->values
                      [pk values] updates]
                  (merge {:table_id table-id :row_pk pk} values))))
(defn- flat! [pk->values] (flat-rows! (for [[pk values] pk->values] values)))
(defn- into-map! [pk->values] (into-rows! (for [[_ values] pk->values] values)))
(defn- values-of! [pk->values] (vals-rows! (vals pk->values)))
(defn- doseq! [pk->values] (doseq [[_ values] pk->values] (doseq-row! values)))
(defn- whole! [pk->values] (whole-map! pk->values))
(defn- opaque-values! [pk->values] (opaque-rows! (for [[_ values] pk->values] values)))
(defn- with-let! [pk->values] (let-rows! (for [[pk values] pk->values :let [row (assoc values :row_pk pk)]] row)))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q {:keys [diffs before]}]
  (nested! (u/for-map [[table-id ds] (group-by :table-id diffs)]
             [table-id (u/for-map [{:keys [pk after]} ds :when after]
                         [pk {:raw_after after :undoable true}])]))
  (flat! (u/for-map [d diffs] [(:pk d) {:raw_after (:after d)}]))
  (into-map! (into {} (for [d diffs] [(:pk d) {:raw_after (:after d)}])))
  (values-of! (u/for-map [d diffs] [(:pk d) {:raw_after (:after d)}]))
  (doseq! (u/for-map [d diffs] [(:pk d) {:raw_after (:after d)}]))
  (whole! (u/for-map [d diffs] [(:pk d) {:raw_after (:after d)}]))
  (opaque-values! (u/for-map [d diffs] [(:pk d) before]))
  (with-let! (u/for-map [d diffs] [(:pk d) {:raw_after (:after d)}])))")] :rules [rule]}))]
    (testing "a `[k v]` destructured off a map built by `u/for-map` from `[k {literal}]` pairs has the literal's
              shape, and so does a `merge` of it with a literal -- two levels down"
      (is (= "(:shape/keyed)" (get by-row 3))))
    (testing "one level down, through `u/for-map`, through `(into {} (for ... [k v]))`, through `vals`, in a `doseq`"
      (is (= "(:shape/keyed)" (get by-row 4)))
      (is (= "(:shape/keyed)" (get by-row 5)))
      (is (= "(:shape/keyed)" (get by-row 6)))
      (is (= "(:shape/keyed)" (get by-row 7))))
    (testing "the map of maps itself, handed on whole, is opaque: its keys are values"
      (is (= "(:shape/opaque)" (get by-row 8))))
    (testing "values that were a request map stay opaque"
      (is (= "(:shape/opaque)" (get by-row 9))))
    (testing "a `:let` inside the `for` binding vector is followed"
      (is (= "(:shape/keyed)" (get by-row 10))))))

(deftest shape-of-chosen-keys-and-returned-keys-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/shape ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(defn- fields [] [:email :first_name])
(defn- build [xs] {:to-delete (map :id xs) :to-insert (for [x xs] {:table_id (:id x) :value 1})})
(defn- unknown [x] x)
(defn- chosen! [m] (sink m))
(defn- computed! [m] (sink m))
(defn- destructured! [rows] (sink rows))
(defn- accessed! [rows] (sink rows))
(defn- other-key! [rows] (sink rows))
(defn- not-literal! [rows] (sink rows))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body]
  (chosen! (select-keys body (conj (fields) :is_active)))
  (computed! (select-keys body (:fields body)))
  (let [{:keys [to-insert]} (build [{:id id}])]
    (destructured! to-insert))
  (accessed! (:to-insert (build [{:id id}])))
  (let [{:keys [to-delete]} (build [{:id id}])]
    (other-key! to-delete))
  (let [{:keys [to-insert]} (unknown body)]
    (not-literal! to-insert)))")] :rules [rule]}))]
    (testing "`select-keys` with keys a function chose -- a literal keyword vector, one more conj'd on -- is keyed;
              with keys the request chose it is opaque"
      (is (= "(:shape/keyed)" (get by-row 6)))
      (is (= "(:shape/opaque)" (get by-row 7))))
    (testing "a key destructured or read off a function's return has the shape the function put under that key"
      (is (= "(:shape/keyed)" (get by-row 8)))
      (is (= "(:shape/keyed)" (get by-row 9))))
    (testing "another key of it has its own: a sequence of ids is no map"
      (is (= "(:shape/opaque)" (get by-row 10))))
    (testing "and a function whose tails are not literals says nothing about its keys"
      (is (= "(:shape/opaque)" (get by-row 11))))))

(deftest shape-through-apply-and-thread-last-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/shape ctx (ast/arg node 0))))})}
        ;; the permission-graph pattern: rows built as literals under `map`/`keep` in a `->>`, concatenated,
        ;; returned under a key from two branches, the branches merged with `apply merge-with`, the key
        ;; destructured off the result and handed to the write
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2]))
(defn sink [x] x)
(defn- merge-changes [& changes] (apply merge-with (fn [a b] (distinct (concat a b))) changes))
(defn- new-rows [group-id table-perms]
  (map (fn [[table value]] (let [{:keys [id db_id]} table] {:group_id group-id :table_id id :db_id db_id :value value})) table-perms))
(defn- existing [db-id ids]
  (let [others (->> (t2/select :model/Table :db_id db-id)
                    (remove #(contains? ids (:id %)))
                    (keep (fn [table] {:group_id 1 :table_id (:id table) :db_id db-id :value :no})))]
    {:to-delete [db-id] :to-insert (concat others (new-rows 1 {}))}))
(defn- fresh [group-id table-perms]
  {:to-delete [] :to-insert (new-rows group-id table-perms)})
(defn- build [group-id db-id table-perms]
  (if (empty? table-perms)
    {:to-delete [] :to-insert []}
    (apply merge-changes
           (if-let [db-perm (t2/select-one :model/DataPermissions :db_id db-id)]
             (existing db-id #{})
             (fresh group-id table-perms))
           [(fresh group-id table-perms)])))
(defn- insert! [rows] (sink rows))
(defn- applied! [m] (sink m))
(defn- threaded! [rows] (sink rows))
(defn- threaded-opaque! [rows] (sink rows))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body]
  (let [{:keys [to-insert]} (build id id (:table-perms body))]
    (insert! to-insert))
  (applied! (apply merge-changes [{:a 1}] [(fresh id {})]))
  (threaded! (->> [{:id 1}] (filter :id) (map (fn [t] {:table_id (:id t)}))))
  (threaded-opaque! (->> [{:id 1}] (map (fn [t] (:row t))))))")] :rules [rule]}))]
    (testing "a key destructured off a function whose tails are a literal and an `apply` of a merge helper over the
              branches of an `if-let`: keyed, since every path builds its rows as literals"
      (is (= "(:shape/keyed)" (get by-row 21))))
    (testing "`(apply merge-with f xs)` and `(apply f xs)` are the merge, and the call, over the elements"
      (is (= "(:shape/keyed)" (get by-row 22))))
    (testing "`->>` has its last step's shape: a `map` over a literal body is rows, over an accessor is not"
      (is (= "(:shape/keyed)" (get by-row 23)))
      (is (= "(:shape/opaque)" (get by-row 24))))))

(deftest schema-shape-test
  (let [rule {:id :test/shape :name "n" :description "d" :severity :error :precision :high :cwe "C"
              :triggers '#{t/sink}
              :detect (fn [{:keys [node] :as ctx}]
                        {:message (pr-str (sort (taint/shape ctx (ast/arg node 0))))})}
        by-row (into {} (map (juxt :row :message))
                     (engine/analyze {:paths [(temp! "(ns t (:require [metabase.api.macros :as api.macros] [metabase.util.malli.schema :as ms]))
(defn sink [x] x)
(defn- inline! [m] (sink m))
(defn- registry! [m] (sink m))
(defn- open! [m] (sink m))
(defn- bare! [m] (sink m))
(defn- entry! [m] (sink m))
(api.macros/defendpoint :put \"/a/:id\" \"doc\" [{:keys [id]} _q body :- [:map {:closed true} [:name :string]]]
  (sink body)
  (inline! body))
(api.macros/defendpoint :put \"/b/:id\" \"doc\" [{:keys [id]} _q {:keys [name] :as body} :- ::t/update]
  (registry! body))
(api.macros/defendpoint :put \"/c/:id\" \"doc\" [{:keys [id]} _q details :- ms/DatabaseDetails]
  (open! details))
(api.macros/defendpoint :put \"/d/:id\" \"doc\" [{:keys [id]} _q body]
  (bare! body))
(api.macros/defendpoint :put \"/e/:id\" \"doc\" [{:keys [id]} _q {:keys [settings viz]} :- [:map {:closed true} [:settings [:map {:closed true} [:x :int]]] [:viz ms/VisualizationSettings]]]
  (entry! settings)
  (entry! viz))")] :rules [rule]}))]
    (testing "a request map under a map schema is keyed: every map an endpoint can reach is closed at load time and
              the decoder strips undeclared keys, so the schema is the allow-list"
      (is (= "(:shape/keyed)" (get by-row 9)))
      (is (= "(:shape/keyed)" (get by-row 3))))
    (testing "a registry schema is closed by the same check; the `:as` binding is the whole map"
      (is (= "(:shape/keyed)" (get by-row 4))))
    (testing "a deliberately open schema is what it says"
      (is (= "(:shape/opaque)" (get by-row 5))))
    (testing "no schema, no shape"
      (is (= "(:shape/opaque)" (get by-row 6))))
    (testing "a destructured key has its own entry's shape: one closed map, one deliberately open"
      (is (= "(:shape/keyed :shape/opaque)" (get by-row 7))))))

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

(deftest after-method-holds-the-return-test
  (let [by-row (origins-of! "(ns t (:require [toucan2.core :as t2] [methodical.core :as methodical] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(methodical/defmulti login! (fn [provider _creds] provider))
(methodical/defmethod login! :password [_ {:keys [password]}]
  (let [user (t2/select-one :model/User :password password)]
    {:success? true :user user}))
(methodical/defmethod login! :token [_ {:keys [token]}]
  (let [ai (t2/select-one :model/AuthIdentity :token token)]
    {:success? true :auth-identity ai :token token}))
(methodical/defmethod login! :after :token [_ {:keys [user auth-identity] :as result}]
  (sink auth-identity)
  (sink user)
  (sink result)
  result)
(methodical/defmethod login! :around :token [provider creds]
  (sink creds)
  (next-method provider creds))
(api.macros/defendpoint :post \"/login\" \"doc\" [_r _q {:keys [provider creds]}]
  (let [{:keys [auth-identity]} (login! provider creds)]
    (sink auth-identity))
  (sink (:user (login! provider creds)))
  (sink (login! provider creds)))")
        ;; the same, with the implementations in another namespace than the multimethod: `:fn` on a defmethod's
        ;; tails must be the multimethod for its return to reach a caller
        across (let [rule {:id :test/origins :name "n" :description "d" :severity :error :precision :high :cwe "C"
                           :triggers '#{t/sink}
                           :detect (fn [{:keys [node] :as ctx}]
                                     {:message (pr-str (sort (taint/origins ctx (ast/arg node 0))))})}]
                 (into {} (map (juxt :row :message))
                       (engine/analyze {:paths [(temp! "(ns t)
(defn sink [x] x)
(defmulti login! (fn [provider _creds] provider))
(defn caller [provider creds] (sink (login! provider creds)))")
                                                (temp! "(ns t.impl (:require [t] [toucan2.core :as t2] [methodical.core :as methodical]))
(methodical/defmethod t/login! :token [_ _creds]
  (t2/select-one :model/AuthIdentity :token 1))
(methodical/defmethod t/login! :after :token [_ result]
  (t/sink result)
  result)")]
                                        :rules [rule]})))]
    (testing "an `:after` method's last parameter is what the primary returned, not what the caller passed:
              a key of it carries what the primary put under that key, and nothing of the request"
      (is (= "(:app-db/AuthIdentity)" (get by-row 11)) "auth-identity: read by the :token primary")
      (is (= "(:app-db/User)" (get by-row 12)) "user: read by the :password primary, which returns under :user")
      (is (= "(:app-db/AuthIdentity :app-db/User)" (get by-row 13)) "the whole result: every primary's return"))
    (testing "an `:around` method's parameters are the call's arguments, as a primary's; `next-method` is implicit"
      (is (= "(:request)" (get by-row 16))))
    (testing "a caller of the multimethod sees every primary's return"
      (is (= "(:app-db/AuthIdentity :app-db/User)" (get by-row 22))))
    (testing "and across namespaces, where the implementation's name is written through an alias"
      (is (= "(:app-db/AuthIdentity)" (get across 4)) "the caller")
      (is (= "(:app-db/AuthIdentity)" (get across 5)) "the :after method"))))

(deftest key-terms-through-around-method-test
  (let [by-row (origins-of! "(ns t (:require [toucan2.core :as t2] [methodical.core :as methodical] [metabase.api.macros :as api.macros]))
(defn sink [x] x)
(methodical/defmulti authenticate (fn [provider _request] provider))
(methodical/defmethod authenticate :token [_ {:keys [token]}]
  (let [ai (t2/select-one :model/AuthIdentity :token token)]
    {:success? true :user-id (:user_id ai) :auth-identity ai}))
(methodical/defmethod authenticate :password [_ {:keys [password]}]
  {:success? true :user-data (t2/select-one :model/User :password password)})
(methodical/defmethod authenticate :after :default [_ result]
  (if (:expired? result) (assoc result :success? false) result))
(defn gate [_provider login-result] login-result)
(defn- fetch-user [id] (t2/select-one :model/User id))
(methodical/defmulti login! (fn [provider _request] provider))
(methodical/defmethod login! :default [provider request]
  (if (:success? request) (assoc request :redirect-url \"/\") request))
(methodical/defmethod login! :around :default [provider request]
  (as-> (merge (dissoc request :user :auth-identity) (authenticate provider request)) $
    (cond-> $ (:user-id $) (assoc :user (fetch-user (:user-id $))))
    (next-method provider $)
    (gate provider $)
    (select-keys $ [:success? :user])))
(methodical/defmethod login! :after :token [_ {:keys [user auth-identity user-data] :as result}]
  (sink auth-identity)
  (sink user)
  (sink user-data)
  (sink result)
  result)
(api.macros/defendpoint :post \"/login\" \"doc\" [_r _q {:keys [provider creds]}]
  (login! provider creds))")]
    (testing "an `:after` method holds what the chain under the `:around` returns, as the `:around`'s `next-method`
              call invoked it: a key is followed through `as->`, `merge`, `dissoc`, `cond->`/`assoc` and a function
              that returns its argument to the implementation that put it there -- and the `select-keys` the
              `:around` applies afterwards, which a caller sees, does not apply here"
      (is (= "(:app-db/AuthIdentity)" (get by-row 23)) "auth-identity: the :token authenticate's literal")
      (is (= "(:app-db/User)" (get by-row 24)) "user: the assoc in the :around, from fetch-user")
      (is (= "(:app-db/User)" (get by-row 25)) "user-data: the :password authenticate's literal"))
    (testing "the whole return holds all of it"
      (is (= "(:app-db/AuthIdentity :app-db/User)" (get by-row 26))))))
