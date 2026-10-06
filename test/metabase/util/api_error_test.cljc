(ns metabase.util.api-error-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.api-error :as api-error]))

(deftest ^:parallel expose-test
  (testing "lists keys as client-facing without renaming them"
    (is (= {:status-code 400, :errors {:id "bad"}, :card-id 1, ::api-error/keys #{:errors}}
           (api-error/expose {:status-code 400, :errors {:id "bad"}, :card-id 1} :errors))))
  (testing "adds to keys already listed"
    (is (= #{:errors :error-code}
           (::api-error/keys (-> {:errors 1, :error-code "x"}
                                 (api-error/expose :errors)
                                 (api-error/expose :error-code))))))
  (testing "works on nil"
    (is (= {::api-error/keys #{:errors}} (api-error/expose nil :errors))))
  (testing "no keys leaves the data as it is"
    (is (= {:status-code 404} (api-error/expose {:status-code 404})))
    (is (= {:status-code 404} (ex-data (api-error/ex-info "Not found" {:status-code 404} nil))))))

(deftest ^:parallel response-data-test
  (testing "only the listed keys are returned"
    (is (= {:errors {:id "bad"}, :error-code "x"}
           (api-error/response-data {:status-code      400
                                     :query            {:secret "SELECT"}
                                     :errors           {:id "bad"}
                                     :error-code       "x"
                                     ::api-error/keys #{:errors :error-code}}))))
  (testing "listed keys that are absent are skipped"
    (is (= {:errors 1}
           (api-error/response-data {:errors 1, ::api-error/keys #{:errors :message}}))))
  (testing "nothing listed returns an empty map"
    (is (= {} (api-error/response-data {:status-code 403, :query {}})))
    (is (= {} (api-error/response-data nil)))))

(deftest ^:parallel api-ex-info-test
  (testing "builds an ex-info whose listed keys are client-facing"
    (let [e (api-error/ex-info "Nope" {:status-code 400, :card-id 1, :errors {:a "b"}} #{:errors})]
      (is (= "Nope" (ex-message e)))
      (is (= {:status-code 400, :card-id 1, :errors {:a "b"}, ::api-error/keys #{:errors}} (ex-data e)))
      (is (= {:errors {:a "b"}} (api-error/response-data (ex-data e))))))
  (testing "keeps the cause"
    (let [cause (ex-info "root" {})
          e     (api-error/ex-info "Nope" {:status-code 400, :errors 1} #{:errors} cause)]
      (is (identical? cause (ex-cause e)))))
  (testing "a cause in the keys' position, the shape of clojure.core/ex-info, is rejected clearly"
    (is (thrown-with-msg? #?(:clj clojure.lang.ExceptionInfo :cljs js/Error) #"client-facing keys before the cause"
                          (api-error/ex-info "Nope" {:status-code 400} (ex-info "cause" {}))))))

#?(:clj
   (deftest ^:parallel exposing-test
     (testing "rethrows an ExceptionInfo from code we don't own with the named keys listed"
       (let [e (try
                 (api-error/exposing #{:errors}
                   (throw (ex-info "Too many attempts!" {:status-code 400, :errors {:username "wait"}, :ip "1.2.3.4"})))
                 (catch clojure.lang.ExceptionInfo e e))]
         (is (= "Too many attempts!" (ex-message e)))
         (is (= {:status-code 400, :errors {:username "wait"}, :ip "1.2.3.4", ::api-error/keys #{:errors}}
                (ex-data e)))))
     (testing "returns the body's value when nothing is thrown"
       (is (= 3 (api-error/exposing #{:errors} (* 1 3)))))
     (testing "an exception that already exposes the keys is rethrown as it is"
       (let [e (api-error/ex-info "Too many attempts!" {:status-code 400, :errors {:username "wait"}} #{:errors})]
         (is (identical? e (try
                             (api-error/exposing #{:errors} (throw e))
                             (catch clojure.lang.ExceptionInfo e' e'))))))))

#?(:clj
   (deftest ^:parallel throwable->map-test
     (testing "every `:data` in the Throwable->map is reduced to its client-facing part and status code"
       (let [e (ex-info "outer" {:status-code 400, :query {:secret 1}, :errors {:a 1}, ::api-error/keys #{:errors}}
                        (ex-info "inner" {:sql "SELECT secret"}))
             m (api-error/throwable->map e)]
         (is (= "inner" (:cause m)))
         (is (not (contains? m :data))
             "the root cause has no client-facing data")
         (is (= [{:errors {:a 1}, :status-code 400} nil]
                (map :data (:via m)))
             "`:status-code` is kept with the client-facing data")
         (is (seq (:trace m)))))))
