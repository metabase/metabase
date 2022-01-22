(ns metabase.query-processor.postprocess-test)

;; TODO -- enable this test.
#_(deftest row-type-agnostic-test
  (let [api-qp-middleware-options (delay (-> (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query users {:limit 1}))
                                             :json_query
                                             :middleware))]
    (mt/test-drivers (mt/normal-drivers)
      (testing "All QP middleware should work regardless of the type of each row (#13475)"
        (doseq [rows [[[1]
                       [Integer/MAX_VALUE]]
                      [(list 1)
                       (list Integer/MAX_VALUE)]
                      [(cons 1 nil)
                       (cons Integer/MAX_VALUE nil)]
                      [(lazy-seq [1])
                       (lazy-seq [Integer/MAX_VALUE])]]]
          (testing (format "rows = ^%s %s" (.getCanonicalName (class rows)) (pr-str rows))
            (letfn [(process-query [& {:as additional-options}]
                      (:post
                       (mt/test-qp-middleware
                        qp/default-middleware
                        (merge
                         {:database (mt/id)
                          :type     :query
                          :query    {:source-table (mt/id :venues)
                                     :fields       [[:field-id (mt/id :venues :id)]]}}
                         additional-options)
                        rows)))]
              (is (= [[1]
                      [2147483647]]
                     (process-query)))
              (testing "Should work with the middleware options used by API requests as well"
                (is (= [["1"]
                        ["2147483647"]]
                       (process-query :middleware @api-qp-middleware-options)))))))))))
