(ns metabase.util.validated-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.validated :as validated]))

(set! *warn-on-reflection* true)

(def ^:private writable-card-ids #{1 2})

(defrecord RenameCard [user-id card-id title]
  validated/Validatable
  (checks [_]
    [[::card-id-positive (pos-int? card-id)]
     [::title-not-blank  (or (and (string? title) (not (str/blank? title)))
                             {:title title})]])
  (external-checks [_]
    [[::may-write-card (and (= user-id 1) (contains? writable-card-ids card-id))]]))

(defrecord OtherRecord [user-id card-id title]
  validated/Validatable
  (checks [_] [])
  (external-checks [_] []))

(defn- thrown-data [thunk]
  (try (thunk) nil
       (catch clojure.lang.ExceptionInfo e (ex-data e))))

(deftest validate-test
  (testing "every check passes: validate returns the record, and validated accepts it"
    (let [record (->RenameCard 1 1 "New")]
      (is (identical? record (validated/validate record)))
      (is (identical? record (validated/validated RenameCard record)))))
  (testing "a failed check is a 400 reporting every failure, by name, with its result"
    (is (= {:status-code 400
            :record      RenameCard
            :failures    {::card-id-positive false
                          ::title-not-blank  {:title " "}}}
           (thrown-data #(validated/validate (->RenameCard 1 -1 " "))))))
  (testing "a failed external check is a 403"
    (is (= {:status-code 403
            :record      RenameCard
            :failures    {::may-write-card false}}
           (thrown-data #(validated/validate (->RenameCard 1 3 "New"))))))
  (testing "who is acting is a field: the same card, another user"
    (is (= 403 (:status-code (thrown-data #(validated/validate (->RenameCard 2 1 "New"))))))))

(deftest external-checks-wait-for-checks-test
  (let [ran    (atom false)
        record (reify validated/Validatable
                 (checks [_] [[::fails false]])
                 (external-checks [_] [[::fetch (reset! ran true)]]))]
    (is (= 400 (:status-code (thrown-data #(validated/validate record)))))
    (is (false? @ran) "external checks never run on a record that failed a check")))

(deftest exceptions-propagate-test
  (let [record (reify validated/Validatable
                 (checks [_] [])
                 (external-checks [_] [[::not-found (throw (ex-info "Not found." {:status-code 404}))]]))]
    (is (= {:status-code 404} (thrown-data #(validated/validate record))))))

(deftest validated-refuses-any-record-validate-did-not-return-test
  (let [record (validated/validate (->RenameCard 1 1 "New"))]
    (doseq [[label x] [["nil" nil]
                       ["a plain map" {:user-id 1, :card-id 3, :title "pwned"}]
                       ["a record built with the constructor" (->RenameCard 1 3 "pwned")]
                       ["a record equal to a validated one, built by hand" (->RenameCard 1 1 "New")]
                       ["assoc on a validated record" (assoc record :card-id 3)]
                       ["a validated record of another type" (validated/validate (->OtherRecord 1 3 "pwned"))]]]
      (testing label
        (is (= {:status-code 500, :expected RenameCard, :got (type x)}
               (thrown-data #(validated/validated RenameCard x))))
        (is (false? (validated/validated? RenameCard x)))))
    (is (true? (validated/validated? RenameCard record)))
    (testing "the real one still works, read through its fields"
      (let [^RenameCard validated-record (validated/validated RenameCard record)]
        (is (= 1 (.-card-id validated-record)))))))
