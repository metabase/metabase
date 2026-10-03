(ns metabase.app-db.hugsql-test
  (:require
   [clojure.test :refer :all]
   [hugsql.parameters :as hugsql.params]
   [metabase.app-db.hugsql :as app-db.hugsql]))

(set! *warn-on-reflection* true)

;;; The disarm is the security control this namespace exists for, so it gets a test rather than a
;;; docstring. `apply-hugsql-param` dispatches on `(:type param)` -- a key inside the param map, not
;;; the first argument -- so a test that passes the type positionally dispatches on nil and "passes"
;;; against a hole. These call it the way `hugsql.core/prepare-sql` does.

(defn- apply-param
  "Build one HugSQL param of `param-type`, the way the generated sqlvec fn would."
  [param-type]
  (hugsql.params/apply-hugsql-param {:type param-type :name "x"} {:x "anything"} {}))

(deftest ^:parallel raw-splice-param-types-throw-test
  (testing "every param type that can carry text into a statement is disarmed"
    (doseq [param-type @#'app-db.hugsql/disarmed-param-types]
      (testing (str param-type)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Raw-splice HugSQL param .* is not allowed"
                              (apply-param param-type))))))
  (testing "the list covers every non-value type hugsql defines, so nothing is left armed"
    ;; Pinning the set means adding a param type upstream, or dropping one from the ban list, fails
    ;; here rather than silently widening the surface.
    (is (= #{:sql :snip :snip* :sqlvec :sqlvec* :i :identifier :i* :identifier*}
           (set @#'app-db.hugsql/disarmed-param-types)))))

(deftest ^:parallel value-param-types-stay-armed-test
  (testing "`:value`/`:v` are not disarmed -- they emit a ? placeholder and are the intended path"
    ;; They reach hugsql's own impl, so the disarm must not fire. Whatever hugsql then does with
    ;; this synthetic param is its business, so assert on the message rather than on success.
    (doseq [param-type [:value :v]]
      (testing (str param-type)
        (let [msg (try (apply-param param-type) nil
                       (catch Throwable e (ex-message e)))]
          (is (not (some->> msg (re-find #"Raw-splice HugSQL param")))
              "the disarm fired on a value param type"))))))

(deftest ^:parallel unknown-param-type-fails-loudly-test
  (testing "a misspelled param type has no method and throws, rather than splicing"
    ;; Load-bearing for the safety argument: the multimethod has no `:default`, so the ban list does
    ;; not have to be exhaustive against a typo.
    (is (thrown? IllegalArgumentException (apply-param :nto-a-real-type)))))

(deftest ^:parallel non-empty-ids-test
  (testing "an empty collection binds the 0 sentinel, which is correct under both IN and NOT IN"
    (are [in] (= [0] (vec (app-db.hugsql/non-empty-ids in)))
      nil [] #{} '()))
  (testing "a non-empty collection passes through, order preserved"
    (is (= [3 1 2] (vec (app-db.hugsql/non-empty-ids [3 1 2])))))
  (testing "NULL would be wrong here -- `x NOT IN (NULL)` is NULL, not true"
    (is (not= [nil] (vec (app-db.hugsql/non-empty-ids #{}))))))
