(ns metabase.api.docs-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.api.docs.regenerate :as regenerate]
   [metabase.api.open-api :as open-api]
   [metabase.test :as mt]))

(deftest write-openapi-spec-to-file-propagates-errors-test
  (mt/with-temp-dir [directory "openapi-output"]
    (mt/with-dynamic-fn-redefs [regenerate/open-api-object (constantly {})]
      (is (thrown? java.io.IOException
                   (regenerate/write-openapi-spec-to-file! identity directory))))))

(deftest failed-regeneration-preserves-last-spec-test
  (mt/with-temp-dir [directory "openapi-output"]
    (let [file (io/file directory "openapi.json")]
      (spit file "previous spec")
      (mt/with-dynamic-fn-redefs [regenerate/open-api-object (fn [_] (throw (ex-info "Invalid schema" {})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid schema"
                              (regenerate/write-openapi-spec-to-file! identity file)))
        (is (= "previous spec" (slurp file)))))))

(deftest ^:parallel preserve-input-paths-and-components-test
  (let [spec {:paths      {"/api/dev" {} "/api/testing/restore/{name}" {} "/api/item" {}}
              :components {:schemas {"Unused" {:type "string"}}}}]
    (mt/with-dynamic-fn-redefs [open-api/root-open-api-object (constantly spec)]
      (is (= (assoc spec :servers [{:url "" :description "Metabase API"}])
             (regenerate/open-api-object identity))))))

(deftest retry-queued-generation-after-failure-test
  (let [started (promise)
        resume  (promise)
        retried (promise)
        calls   (atom 0)]
    (mt/with-dynamic-fn-redefs [regenerate/write-openapi-spec-to-file!
                                (fn [_]
                                  (if (= 1 (swap! calls inc))
                                    (do
                                      (deliver started true)
                                      (deref resume 5000 nil)
                                      (throw (ex-info "Generation failed" {})))
                                    (deliver retried true)))]
      (let [worker (regenerate/request-spec-regeneration! identity)]
        (try
          (is (true? (deref started 5000 false)))
          (regenerate/request-spec-regeneration! identity)
          (finally
            (deliver resume true)))
        (is (true? (deref retried 5000 false)))
        (is (nil? (deref worker 5000 :timeout)))))))
