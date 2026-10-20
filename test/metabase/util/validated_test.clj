(ns metabase.util.validated-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.validated :as validated]))

(set! *warn-on-reflection* true)

;; What ran, in order. A check may not close over a local, so the log is a var.
(def ^:private ran (atom []))

(defn- log! [x] (swap! ran conj x) true)

(def ^:private writable-card-ids #{1 2})

(def ^:private rename-card-declaration
  {:checks  [{:name  ::card-id-positive
              :doc   "The card id is a positive integer."
              :kind  :pure
              :reads [:card-id]
              :f     (fn [card-id] (log! ::card-id-positive) (pos-int? card-id))}
             {:name  ::title-not-blank
              :doc   "The title is a non-blank string."
              :kind  :pure
              :reads [:title]
              :f     (fn [title]
                       (log! ::title-not-blank)
                       (or (and (string? title) (not (str/blank? title)))
                           {:title title}))}
             {:name  ::title-not-the-card-id
              :doc   "The title is not the card id."
              :kind  :pure
              :reads [:card-id :title]
              :f     (fn [card-id title] (log! ::title-not-the-card-id) (not= (str card-id) title))}
             {:name    ::may-write-card
              :doc     "User 1 may write the card."
              :kind    :external
              :reads   [:user-id]
              :fetches [::card]
              :f       (fn [user-id card] (log! ::may-write-card) (and (= 1 user-id) (:writable? card)))}]
   :fetches [{:name  ::card
              :reads [:card-id]
              :f     (fn [arg-tuples]
                       (log! [::card arg-tuples])
                       (into {} (map (fn [[id :as t]] [t {:id id, :writable? (contains? writable-card-ids id)}]))
                             arg-tuples))}]})

(defrecord RenameCard [user-id card-id title]
  validated/Validatable
  (declaration [_] rename-card-declaration))

(def ^:private other-declaration {:checks []})

(defrecord OtherRecord [user-id card-id title]
  validated/Validatable
  (declaration [_] other-declaration))

(defn- thrown-data [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e (ex-data e))))

(defn- runs [thunk]
  (reset! ran [])
  (thunk)
  @ran)

(deftest parse-test
  (testing "every check passes: parse returns the record, and validated accepts it"
    (let [record (->RenameCard 1 1 "New")]
      (is (identical? record (validated/parse record)))
      (is (identical? record (validated/validated RenameCard record)))))
  (testing "a failed pure check is a 400 reporting every failure by name, with its doc and what it returned"
    (is (= {:status-code 400
            :record      RenameCard
            :failures    {::card-id-positive {:doc      "The card id is a positive integer."
                                              :returned false
                                              :blocked  [::title-not-the-card-id ::may-write-card]}
                          ::title-not-blank  {:doc      "The title is a non-blank string."
                                              :returned {:title " "}
                                              :blocked  [::title-not-the-card-id ::may-write-card]}}}
           (thrown-data #(validated/parse (->RenameCard 1 -1 " "))))))
  (testing "a failed external check is a 403"
    (is (= {:status-code 403
            :record      RenameCard
            :failures    {::may-write-card {:doc "User 1 may write the card.", :returned false}}}
           (thrown-data #(validated/parse (->RenameCard 1 3 "New"))))))
  (testing "who is acting is a field: the same card, another user"
    (is (= 403 (:status-code (thrown-data #(validated/parse (->RenameCard 2 1 "New"))))))))

(deftest order-test
  (testing "shape checks first, then checks over several fields, then fetches, then external checks"
    (is (= [::card-id-positive ::title-not-blank ::title-not-the-card-id [::card [[1]]] ::may-write-card]
           (runs #(validated/parse (->RenameCard 1 1 "New"))))))
  (testing "a failed pure check holds up every fetch and external check, even one that does not read its field"
    (is (= [::card-id-positive ::title-not-blank]
           (runs #(validated/check (->RenameCard 1 -1 "New") nil))))
    (is (= [::card-id-positive ::title-not-blank]
           (runs #(validated/check (->RenameCard 1 1 " ") nil))))))

(deftest remembered-passes-test
  (let [draft (->RenameCard 1 1 "New")]
    (testing "check runs what it names and what that waits on, and remembers the pure checks that passed"
      (is (true? (validated/check draft [::title-not-the-card-id])))
      (is (= #{::card-id-positive ::title-not-blank ::title-not-the-card-id}
             (validated/passed-checks draft))))
    (testing "parse runs only what is not known to pass; external checks run every time"
      (is (= [[::card [[1]]] ::may-write-card]
             (runs #(validated/parse draft))))
      (is (= [[::card [[1]]] ::may-write-card]
             (runs #(validated/check draft nil)))))
    (testing "assoc-field keeps the passes of the checks that do not read the field it writes"
      (let [renamed (validated/assoc-field draft :title "Newer")]
        (is (= #{::card-id-positive} (validated/passed-checks renamed)))
        (is (false? (validated/validated? RenameCard renamed)) "the result is a draft, even of a parsed record")
        (is (= [::title-not-blank ::title-not-the-card-id [::card [[1]]] ::may-write-card]
               (runs #(validated/parse renamed))))))
    (testing "a plain assoc keeps nothing"
      (is (= #{} (validated/passed-checks (assoc draft :title "Newer")))))
    (testing "assoc-field refuses a key that is not a field"
      (is (= 500 (:status-code (thrown-data #(validated/assoc-field draft :titel "x"))))))
    (testing "a failure is not remembered"
      (let [bad (->RenameCard 1 1 " ")]
        (validated/check bad nil)
        (is (not (contains? (validated/passed-checks bad) ::title-not-blank)))
        (is (= [::title-not-blank] (runs #(validated/check bad [::title-not-blank]))))))))

(def ^:private lax-declaration
  {:checks [{:name ::lax, :doc "Any x.", :kind :pure, :reads [:x], :f (fn [_] true)}]})

(def ^:private strict-declaration
  {:checks [{:name ::strict, :doc "A positive x.", :kind :pure, :reads [:x], :f pos-int?}]})

(defrecord Moded [mode x]
  validated/Validatable
  (declaration [_] (if (= :strict mode) strict-declaration lax-declaration)))

(deftest remembered-passes-belong-to-a-plan-test
  (testing "passes remembered under one declaration are not read under another"
    (let [lax (->Moded :lax -1)]
      (validated/check lax nil)
      (is (= #{::lax} (validated/passed-checks lax)))
      (let [strict (validated/assoc-field lax :mode :strict)]
        (is (= #{} (validated/passed-checks strict)))
        (is (= 400 (:status-code (thrown-data #(validated/parse strict)))))))))

(deftest batching-test
  (testing "parse-all calls each fetch once, with each distinct tuple once"
    (let [records [(->RenameCard 1 1 "a") (->RenameCard 1 2 "b") (->RenameCard 1 1 "c")]]
      (is (= [[::card [[1] [2]]]]
             (filter vector? (runs #(validated/parse-all records)))))
      (is (every? #(validated/validated? RenameCard %) records))))
  (testing "parse-all throws once with every failure, by index, and parses none of them"
    (let [records [(->RenameCard 1 1 "a") (->RenameCard 1 3 "b") (->RenameCard 1 -1 "c")]]
      (is (= {:status-code 403
              :failures    {1 {::may-write-card {:doc "User 1 may write the card.", :returned false}}
                            2 {::card-id-positive {:doc      "The card id is a positive integer."
                                                   :returned false
                                                   :blocked  [::title-not-the-card-id ::may-write-card]}}}}
             (thrown-data #(validated/parse-all records))))
      (is (not-any? #(validated/validated? RenameCard %) records)))))

(def ^:private not-found-declaration
  {:checks [{:name        ::exists
             :doc         "The row exists."
             :kind        :external
             :status-code 404
             :f           (fn [] false)}]})

(defrecord NotFound []
  validated/Validatable
  (declaration [_] not-found-declaration))

(def ^:private throws-declaration
  {:checks [{:name ::throws
             :doc  "Throws."
             :kind :external
             :f    (fn [] (throw (ex-info "Not found." {:status-code 404})))}]})

(defrecord Throws []
  validated/Validatable
  (declaration [_] throws-declaration))

(deftest status-code-test
  (is (= 404 (:status-code (thrown-data #(validated/parse (->NotFound))))))
  (testing "exceptions propagate"
    (is (= {:status-code 404} (thrown-data #(validated/parse (->Throws)))))))

;; The declaration under test. Each one is a new map, so each is planned afresh.
(def ^:private bad-declaration (atom nil))

(defrecord Bad [a]
  validated/Validatable
  (declaration [_] @bad-declaration))

(deftest declaration-errors-test
  (let [x 1]
    (doseq [[label decl] [["a check that closes over a local"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :reads [:a], :f (fn [a] (= a x))}]}]
                          ["a check built with constantly, which closes over its argument"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :reads [:a], :f (constantly true)}]}]
                          ["a check built with partial"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :reads [:a], :f (partial = 1)}]}]
                          ["a check built with memoize"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :reads [:a], :f (memoize pos-int?)}]}]
                          ["a field the record does not have"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :reads [:b], :f (fn [_] true)}]}]
                          ["no :doc"
                           {:checks [{:name ::c, :kind :pure, :reads [:a], :f (fn [_] true)}]}]
                          ["no :kind"
                           {:checks [{:name ::c, :doc "d", :reads [:a], :f (fn [_] true)}]}]
                          ["a pure check that fetches"
                           {:checks  [{:name ::c, :doc "d", :kind :pure, :fetches [::f], :f (fn [_] true)}]
                            :fetches [{:name ::f, :reads [], :f (fn [_] {})}]}]
                          ["an undeclared fetch"
                           {:checks [{:name ::c, :doc "d", :kind :external, :fetches [::f], :f (fn [_] true)}]}]
                          ["a name used twice"
                           {:checks [{:name ::c, :doc "d", :kind :pure, :f (fn [] true)}
                                     {:name ::c, :doc "d", :kind :pure, :f (fn [] true)}]}]]]
      (testing label
        (reset! bad-declaration decl)
        (is (= 500 (:status-code (thrown-data #(validated/parse (->Bad 1))))))))))

(deftest validated-refuses-any-record-parse-did-not-return-test
  (let [record (validated/parse (->RenameCard 1 1 "New"))]
    (doseq [[label x] [["nil" nil]
                       ["a plain map" {:user-id 1, :card-id 3, :title "pwned"}]
                       ["a record built with the constructor" (->RenameCard 1 3 "pwned")]
                       ["a record equal to a parsed one, built by hand" (->RenameCard 1 1 "New")]
                       ["assoc on a parsed record" (assoc record :card-id 3)]
                       ["assoc-field on a parsed record" (validated/assoc-field record :card-id 2)]
                       ["a parsed record of another type" (validated/parse (->OtherRecord 1 3 "pwned"))]]]
      (testing label
        (is (= {:status-code 500, :expected RenameCard, :got (type x)}
               (thrown-data #(validated/validated RenameCard x))))
        (is (false? (validated/validated? RenameCard x)))))
    (is (true? (validated/validated? RenameCard record)))
    (testing "the real one still works, read through its fields"
      (let [^RenameCard parsed (validated/validated RenameCard record)]
        (is (= 1 (.-card-id parsed)))))))

(deftest no-var-quote-into-validated-test
  (testing "the private maps that remember parsed records are reachable by var-quote, so no source file may use one"
    (is (= []
           (for [dir                ["src" "enterprise/backend/src"]
                 ^java.io.File file (file-seq (io/file dir))
                 :when              (and (.isFile file) (re-find #"\.clj[cs]?$" (.getName file)))
                 :when              (re-find #"#'(metabase\.util\.)?validated/" (slurp file))]
             (str file))))))
