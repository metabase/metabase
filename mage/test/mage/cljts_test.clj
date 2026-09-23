(ns mage.cljts-test
  "Golden tests for `mage cljts`: Clojure in, TypeScript-ish text out."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [mage.cljts.core :as cljts]
   [mage.cljts.diff :as diff]
   [mage.cljts.git :as git]
   [mage.cljts.names :as names]
   [mage.cljts.server :as server]))

(set! *warn-on-reflection* true)

(def ^:private ns-form
  "(ns my.app
  (:require [toucan2.core :as t2]
            [metabase.util.malli :as mu]
            [metabase.util.malli.schema :as ms]
            [metabase.api.macros :as api.macros]
            [metabase.settings.core :refer [defsetting]]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [metabase.test :as mt]
            [clojure.string :as str]
            [clojure.test :refer :all]))\n")

(defn- translate
  "Translate `source` (with a standard ns form prepended) and return the output after the imports."
  [source]
  (let [out (cljts/translate-string (str ns-form "\n" source))]
    (->> (str/split-lines out)
         (drop-while #(not (str/blank? %)))
         (drop-while str/blank?)
         (str/join "\n"))))

(defn- lines [& ls] (str/join "\n" ls))

(deftest ^:parallel camel-case-names-test
  (are [in out] (= out (names/camel in))
    "user-id"     "userId"
    "can-read?"   "canRead"
    "admin?"      "isAdmin"
    "save!"       "save"
    "->id"        "toId"
    "a->b"        "aToB"
    "*dynamic-x*" "*dynamicX*"
    "$price"      "$price"))

(deftest ^:parallel functions-and-locals-test
  (is (= (lines "/** Adds one. */"
                "function addOne(x) {"
                "  const y = x + 1;"
                "  return y;"
                "}")
         (translate "(defn add-one \"Adds one.\" [x] (let [y (inc x)] y))")))
  (testing "shadowed locals become let + reassignment"
    (is (= (lines "function f(x) {"
                  "  let y = x.id;"
                  "  y = y + 1;"
                  "  return y;"
                  "}")
           (translate "(defn f [x] (let [y (:id x) y (inc y)] y))"))))
  (testing "destructuring"
    (is (= (lines "function f({ id, \"display-name\": displayName }) {"
                  "  return `${id}: ${displayName}`;"
                  "}")
           (translate "(defn f [{:keys [id display-name]}] (str id \": \" display-name))")))))

(deftest ^:parallel control-flow-test
  (is (= (lines "function f(x) {"
                "  if (x == null) {"
                "    return \"none\";"
                "  } else if (x > 10) {"
                "    return \"big\";"
                "  } else {"
                "    return \"small\";"
                "  }"
                "}")
         (translate "(defn f [x] (cond (nil? x) \"none\" (> x 10) \"big\" :else \"small\"))")))
  (is (= (lines "function f(x) {"
                "  return x ? 1 : 2;"
                "}")
         (translate "(defn f [x] (if x 1 2))"))))

(deftest ^:parallel threading-test
  (testing "chains that start with the value become method chains"
    (is (= (lines "function ids(xs) {"
                  "  return xs.map((x) => x.id).filter((x) => x > 0);"
                  "}")
           (translate "(defn ids [xs] (->> xs (map :id) (filter pos?)))")
           (translate "(defn ids [xs] (->> xs (map :id) (filter #(> % 0))))"))))
  (testing "other steps become pipelines with an explicit placeholder"
    (is (= (lines "function f(m) {"
                  "  return m |> { ...%, a: 1 } |> omit(%, \"b\");"
                  "}")
           (translate "(defn f [m] (-> m (assoc :a 1) (dissoc :b)))"))))
  (testing "cond-> becomes conditional reassignment"
    (is (= (lines "function f(m, limit) {"
                  "  let acc = m;"
                  "  if (limit) acc = { ...acc, limit };"
                  "  return acc;"
                  "}")
           (translate "(defn f [m limit] (cond-> m limit (assoc :limit limit)))")))))

(deftest ^:parallel comments-test
  (is (= (lines "// leading comment"
                "function f() {"
                "  // inside"
                "  return 1; // trailing"
                "}")
         (translate ";; leading comment\n(defn f []\n  ;; inside\n  1 ; trailing\n)"))))

(deftest ^:parallel malli-test
  (testing "short return schemas are shown as the return type"
    (is (= (lines "/** Doc. */"
                  "function f(id: ms.PositiveInt, name: string | null): { id: ms.PositiveInt, name?: string } {"
                  "  return { id, name };"
                  "}")
           (translate "(mu/defn f :- [:map [:id ms/PositiveInt] [:name {:optional true} :string]]
                         \"Doc.\"
                         [id :- ms/PositiveInt name :- [:maybe :string]]
                         {:id id :name name})"))))
  (testing "long return schemas are described in the doc comment instead"
    (is (= (lines "/**"
                  " * Doc."
                  " *"
                  " * Returns: a map with id (ms.PositiveInt), name (optional string, or nil), tags (a list of Keyword)"
                  " */"
                  "function f(id: ms.PositiveInt): object {"
                  "  return g(id);"
                  "}")
           (translate "(mu/defn f :- [:map [:id ms/PositiveInt] [:name {:optional true} [:maybe :string]] [:tags [:sequential :keyword]]]
                         \"Doc.\"
                         [id :- ms/PositiveInt]
                         (g id))")))))

(deftest ^:parallel toucan-sql-test
  (is (= (lines "function card(id) {"
                "  return t2.selectOne(Card, sql`SELECT * FROM report_card WHERE (id = ${id}) AND (archived = FALSE)`);"
                "}")
         (translate "(defn card [id] (t2/select-one :model/Card :id id :archived false))")))
  (is (= (lines "function names() {"
                "  return t2.select(Card, sql`SELECT name FROM report_card WHERE type = 'model' ORDER BY name ASC`)"
                "    .map((x) => x.name);"
                "}")
         (translate "(defn names [] (t2/select-fn-vec :name :model/Card :type :model {:order-by [[:name :asc]]}))"))))

(deftest ^:parallel defendpoint-test
  (is (= (lines "/** Get a thing. */"
                "router.get(\"/:id\", (/* route params */ { id }: { id: ms.PositiveInt }) => {"
                "  return getThing(id);"
                "});")
         (translate "(api.macros/defendpoint :get \"/:id\"
                       \"Get a thing.\"
                       [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
                       (get-thing id))"))))

(deftest ^:parallel defsetting-test
  (is (= (lines "/** Whether things are enabled. */"
                "const isThingsEnabled = defineSetting({ type: \"boolean\", default: false, visibility: \"public\" });")
         (translate "(defsetting things-enabled?
                       (deferred-tru \"Whether things are enabled.\")
                       :type :boolean :default false :visibility :public)"))))

(deftest ^:parallel tests-test
  (is (= (lines "test(\"thing-test\", () => {"
                "  describe(\"works\", () => {"
                "    using card = withTemp(Card, { name: \"x\" });"
                "    expect(api.as(\"rasta\").expect(200).get(`card/${card.id}`)).toMatchObject({ name: \"x\" });"
                "  });"
                "});")
         (translate "(deftest thing-test
                       (testing \"works\"
                         (mt/with-temp [:model/Card card {:name \"x\"}]
                           (is (=? {:name \"x\"} (mt/user-http-request :rasta :get 200 (str \"card/\" (:id card))))))))"))))

(deftest ^:parallel fallback-test
  (testing "unknown macros using syntax-quote are shown as raw Clojure"
    (is (str/includes? (translate "(defmacro m [x] `(do ~x))") "clj`")))
  (testing "translation is deterministic"
    (let [src (slurp "mage/src/mage/cljts/translate.clj")]
      (is (= (cljts/translate-string src) (cljts/translate-string src))))))

(deftest ^:parallel diff-rows-test
  (is (= [{:type :ctx :old 1 :new 1 :text "a"}
          {:type :del :old 2 :new nil :text "b"}
          {:type :add :old nil :new 2 :text "c"}
          {:type :ctx :old 3 :new 3 :text "d"}]
         (diff/diff-rows "a\nb\nd\n" "a\nc\nd\n"))))

;;; ------------------------------------------------ Regressions from code review ----------------------------------

(deftest ^:parallel not-keeps-negation-test
  (is (= (lines "function f(x) {" "  return !x;" "}")
         (translate "(defn f [x] (not x))")))
  (is (str/includes? (translate "(defn f [x] (when (not (nil? x)) 1))") "if (x != null)"))
  (is (str/includes? (translate "(defn f [a b] (not (and a b)))") "return !(a && b);"))
  (testing "negating a multi-argument = negates the whole comparison"
    (is (str/includes? (translate "(defn f [a b c] (when-not (= a b c) 1))") "if (!(a == b && b == c))"))))

(deftest ^:parallel some-thread-is-nil-safe-test
  (is (= (lines "function f(x) {" "  return x?.a?.b;" "}")
         (translate "(defn f [x] (some-> x :a :b))"))))

(deftest ^:parallel thread-operator-step-not-chained-test
  (let [out (translate "(defn f [x] (-> x :n inc str/trim))")]
    (is (not (str/includes? out "1.trim()")))
    (is (str/includes? out "|> %.trim()"))))

(deftest ^:parallel case-in-block-expression-breaks-test
  (let [out (translate "(defn f [x] (g (case x 1 (let [a 1] a) 2)))")]
    (is (str/includes? out "break;"))))

(deftest ^:parallel rebinding-destructured-name-test
  (is (= (lines "function f(m) {"
                "  let { a } = m;"
                "  a = a + 1;"
                "  return a;"
                "}")
         (translate "(defn f [m] (let [{:keys [a]} m a (inc a)] a))"))))

(deftest ^:parallel recur-in-anonymous-fn-test
  (let [out (translate "(defn f [xs] (loop [i 0] (map (fn [x] (recur x)) xs)))")]
    (is (str/includes? out "recur(x)"))
    (is (not (str/includes? out "i = x")))))

(deftest ^:parallel repo-file-test
  (testing "only regular files inside the repository can be opened"
    (is (= "bb.edn" (git/repo-file "bb.edn")))
    (is (= "bb.edn" (git/repo-file "mage/../bb.edn")))
    (are [path] (nil? (git/repo-file path))
      "/etc/passwd"
      "../../../../../../etc/passwd"
      "file:///etc/passwd"
      "http://example.com/"
      "mage"
      "does-not-exist.clj"
      ""
      nil)))

(deftest ^:parallel pre-post-conditions-test
  (testing "single-parameter type checks in :pre become parameter types; other checks become asserts"
    (is (= (lines "function f(s: string | null, id: number, conn: Connection) {"
                  "  assert(isValid(s, id));"
                  "  return g(s, id);"
                  "}")
           (translate "(defn f [s id conn]
                         {:pre [((some-fn string? nil?) s) (integer? id) (instance? Connection conn) (valid? s id)]}
                         (g s id))"))))
  (testing "`or` of type checks on one parameter becomes a union"
    (is (str/includes? (translate "(defn f [x] {:pre [(or (nil? x) (keyword? x))]} x)") "function f(x: null | Keyword)")))
  (testing "a Malli schema wins over :pre; the :pre check is kept as an assert"
    (is (= (lines "function f(x: ms.PositiveInt) {"
                  "  assert(x is number);"
                  "  return x;"
                  "}")
           (translate "(mu/defn f [x :- ms/PositiveInt] {:pre [(integer? x)]} x)"))))
  (testing ":post type checks become the return type, other :post checks are documented"
    (is (= (lines "/** Ensures: isValid(result) */"
                  "function f(x): object {"
                  "  return g(x);"
                  "}")
           (translate "(defn f [x] {:post [(map? %) (valid? %)]} (g x))"))))
  (testing "a map that is the only body form is a return value, not a condition map"
    (is (str/includes? (translate "(defn f [] {:pre 1})") "return { pre: 1 };")))
  (testing "anonymous functions"
    (is (str/includes? (translate "(def f (fn [x] {:pre [(string? x)]} x))") "const f = (x: string) => x;"))))

(deftest ^:parallel commit-exists-test
  (is (git/commit-exists? "HEAD"))
  (is (not (git/commit-exists? "0000000000000000000000000000000000000000"))))

(deftest ^:parallel parallel-map-test
  (testing "results keep input order"
    (is (= (mapv inc (range 50)) (server/parallel-map inc (range 50)))))
  (testing "errors are rethrown"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                          (server/parallel-map #(if (= % 3) (throw (ex-info "boom" {})) %) (range 5))))))

(deftest ^:parallel changes-page-test
  (let [html (#'server/changes-page {:title "t"
                                     :files [{:path "a.clj" :status :modified :old "(defn f [] 1)\n" :new "(defn f [] 2)\n"}
                                             {:path "b.clj" :status :added :old nil :new "(def x 1)\n"}]}
                                    "ts")]
    (is (str/includes? html "a.clj"))
    (is (str/includes? html "b.clj"))
    (is (str/includes? html "<span class=\"hl-kw\">return</span> <span class=\"hl-number\">2</span>;"))))

(defn- git! [dir & args]
  (apply process/shell {:dir (str dir) :out :string :err :string}
         "git" "-c" "user.email=test@example.com" "-c" "user.name=Test" "-c" "commit.gpgsign=false" args))

(defn- commit! [dir file text]
  (spit (str (fs/path dir file)) text)
  (git! dir "add" file)
  (git! dir "commit" "-q" "-m" (str "change " file)))

(deftest branch-parent-test
  (fs/with-temp-dir [dir {:prefix "cljts-git"}]
    ;; master: a1 -> a2 -> a3 ; `old` from a1 ; `feature` from a2 ; `sub` from feature
    (git! dir "init" "-q" "-b" "master")
    (commit! dir "a.clj" "(ns a)\n")
    (git! dir "branch" "old")
    (commit! dir "a.clj" "(ns a)\n(def x 1)\n")
    (git! dir "checkout" "-q" "-b" "feature")
    (commit! dir "f.clj" "(ns f)\n")
    (git! dir "checkout" "-q" "-b" "sub")
    (commit! dir "s.clj" "(ns s)\n")
    (git! dir "checkout" "-q" "master")
    (commit! dir "a.clj" "(ns a)\n(def x 2)\n")
    (binding [git/*repo-dir* (str dir)]
      (testing "branches resolve by name; unknown names don't"
        (is (= "feature" (git/resolve-branch "feature")))
        (is (nil? (git/resolve-branch "no-such-branch"))))
      (testing "the parent is the branch it forked from most recently"
        (is (= "master" (:ref (git/branch-parent "feature"))))
        (is (= "feature" (:ref (git/branch-parent "sub")))))
      (testing "branch changes cover only the branch's own commits"
        (is (= ["s.clj"] (map :path (:files (git/branch-changes "sub" nil)))))
        (is (= #{"f.clj" "s.clj"} (set (map :path (:files (git/branch-changes "sub" "master"))))))
        (is (str/includes? (:title (git/branch-changes "sub" nil)) "sub vs. feature (its parent)")))
      (testing "unknown branches get a clear error"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No PR or branch named \"nope\""
                              (git/branch-changes "nope" nil)))))))

(deftest ^:parallel source-map-test
  (testing "every output line maps back to the Clojure line it came from (including past 8 forms)"
    (let [src (str "(ns a)\n\n"
                   (str/join "\n\n" (for [i (range 12)] (str "(defn f" i " [x]\n  ;; note " i "\n  (g x " i "))"))))
          {:keys [text rows]} (cljts/translate-with-source-map src)
          src-lines (str/split-lines src)
          out-lines (str/split-lines text)]
      (is (= (count out-lines) (count rows)))
      (doseq [i (range 12)
              :let [fn-line   (inc (.indexOf ^java.util.List src-lines (str "(defn f" i " [x]")))
                    out-fn    (.indexOf ^java.util.List out-lines (str "function f" i "(x) {"))
                    out-note  (.indexOf ^java.util.List out-lines (str "  // note " i))
                    out-body  (.indexOf ^java.util.List out-lines (str "  return g(x, " i ");"))]]
        (is (= fn-line (nth rows out-fn)))
        (is (= (inc fn-line) (nth rows out-note)))
        (is (= (+ fn-line 2) (nth rows out-body)))))))

(deftest ^:parallel typescript-files-not-shown-test
  (let [html (#'server/changes-page {:title "t"
                                     :files [{:path "a.clj" :status :modified :old "(def x 1)\n" :new "(def x 2)\n"}
                                             {:path "frontend/src/thing.tsx" :status :modified :old nil :new nil}
                                             {:path "resources/x.yaml" :status :modified :old "a: 1\n" :new "a: 2\n"}]}
                                    "ts")]
    (testing "non-Clojure files are listed, but their bodies aren't shown"
      (is (str/includes? html "frontend/src/thing.tsx"))
      (is (str/includes? html "You know how TypeScript works."))
      (is (str/includes? html "resources/x.yaml"))
      (is (str/includes? html "Not clojure"))
      (is (not (str/includes? html "a: 2"))))
    (is (git/typescript-file? "frontend/src/thing.tsx"))
    (is (git/typescript-file? "e2e/support/x.js"))
    (is (not (git/typescript-file? "src/metabase/a.clj")))
    (is (not (git/typescript-file? "frontend/src/styles.css")))))
