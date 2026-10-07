(ns metabase.util.api-error-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.api-error :as api-error]))

(deftest ^:parallel extend-response-keys-test
  (testing "lists keys as client-facing without renaming them"
    (is (= {:status-code 400, :errors {:id "bad"}, :card-id 1, :response/keys #{:errors}}
           (api-error/extend-response-keys {:status-code 400, :errors {:id "bad"}, :card-id 1} :errors))))
  (testing "adds to keys already listed"
    (is (= #{:errors :error-code}
           (:response/keys (-> {:errors 1, :error-code "x"}
                               (api-error/extend-response-keys :errors)
                               (api-error/extend-response-keys :error-code))))))
  (testing "works on nil"
    (is (= {:response/keys #{:errors}} (api-error/extend-response-keys nil :errors))))
  (testing "no keys leaves the data as it is"
    (is (= {:status-code 404} (api-error/extend-response-keys {:status-code 404})))
    (is (= {:status-code 404} (ex-data (api-error/ex-info "Not found" {:status-code 404}))))))

(deftest ^:parallel response-data-test
  (testing "only the listed keys are returned"
    (is (= {:errors {:id "bad"}, :error-code "x"}
           (api-error/response-data {:status-code   400
                                     :query         {:secret "SELECT"}
                                     :errors        {:id "bad"}
                                     :error-code    "x"
                                     :response/keys #{:errors :error-code}}))))
  (testing "listed keys that are absent are skipped"
    (is (= {:errors 1}
           (api-error/response-data {:errors 1, :response/keys #{:errors :message}}))))
  (testing "nothing listed returns an empty map"
    (is (= {} (api-error/response-data {:status-code 403, :query {}})))
    (is (= {} (api-error/response-data nil)))))

(deftest ^:parallel api-ex-info-test
  (testing "builds an ex-info whose `:response/keys` are client-facing"
    (let [e (api-error/ex-info "Nope" {:status-code 400, :card-id 1, :errors {:a "b"}} :response/keys #{:errors})]
      (is (= "Nope" (ex-message e)))
      (is (= {:status-code 400, :card-id 1, :errors {:a "b"}, :response/keys #{:errors}} (ex-data e)))
      (is (= {:errors {:a "b"}} (api-error/response-data (ex-data e))))))
  (testing "adds to `:response/keys` already in the data"
    (is (= #{:errors :error-code}
           (:response/keys (ex-data (api-error/ex-info "Nope"
                                                       {:errors 1, :error-code "x", :response/keys #{:error-code}}
                                                       :response/keys #{:errors}))))))
  (testing "keeps the cause, in the position clojure.core/ex-info takes it"
    (let [cause (ex-info "root" {})
          e     (api-error/ex-info "Nope" {:status-code 400, :errors 1} cause :response/keys #{:errors})]
      (is (identical? cause (ex-cause e)))
      (is (= {:errors 1} (api-error/response-data (ex-data e)))))
    (let [cause (ex-info "root" {})
          e     (api-error/ex-info "Nope" {:status-code 400} cause)]
      (is (identical? cause (ex-cause e)))
      (is (= {:status-code 400} (ex-data e)))))
  (testing "keys passed positionally, the old shape, are rejected clearly"
    (is (thrown-with-msg? #?(:clj clojure.lang.ExceptionInfo :cljs js/Error)
                          #"takes the client-facing keys as :response/keys"
                          (api-error/ex-info "Nope" {:status-code 400} #{:errors})))))

#?(:clj
   (deftest ^:parallel exposing-test
     (testing "rethrows an ExceptionInfo from code we don't own with the named keys listed"
       (let [e (try
                 (api-error/exposing #{:errors}
                   (throw (ex-info "Too many attempts!" {:status-code 400, :errors {:username "wait"}, :ip "1.2.3.4"})))
                 (catch clojure.lang.ExceptionInfo e e))]
         (is (= "Too many attempts!" (ex-message e)))
         (is (= {:status-code 400, :errors {:username "wait"}, :ip "1.2.3.4", :response/keys #{:errors}}
                (ex-data e)))))
     (testing "returns the body's value when nothing is thrown"
       (is (= 3 (api-error/exposing #{:errors} (* 1 3)))))
     (testing "an exception that already exposes the keys is rethrown as it is"
       (let [e (ex-info "Too many attempts!" {:status-code 400, :errors {:username "wait"}, :response/keys #{:errors}})]
         (is (identical? e (try
                             (api-error/exposing #{:errors} (throw e))
                             (catch clojure.lang.ExceptionInfo e' e'))))))))

#?(:clj
   (deftest ^:parallel throwable->map-test
     (testing "every `:data` in the Throwable->map is reduced to its client-facing part and status code"
       (let [e (ex-info "outer" {:status-code 400, :query {:secret 1}, :errors {:a 1}, :response/keys #{:errors}}
                        (ex-info "inner" {:sql "SELECT secret"}))
             m (api-error/throwable->map e)]
         (is (= "inner" (:cause m)))
         (is (not (contains? m :data))
             "the root cause has no client-facing data")
         (is (= [{:errors {:a 1}, :status-code 400} nil]
                (map :data (:via m)))
             "`:status-code` is kept with the client-facing data")
         (is (seq (:trace m)))))))
