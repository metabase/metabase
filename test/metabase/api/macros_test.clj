(ns metabase.api.macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-args-test
  (are [args expected] (= expected
                          (#'api.macros/parse-args args))
    '(:post "/move"
            "Moves a number of Cards to a single collection or dashboard."
            [_route-params
             _query-params]
            (neat))
    '{:method :post
      :route {:path "/move"}
      :docstr "Moves a number of Cards to a single collection or dashboard."
      :params {:route {:binding _route-params}, :query {:binding _query-params}}
      :body [(neat)]}

    '(:post "/move"
            "Moves a number of Cards to a single collection or dashboard."
            [_route-params
             _query-params
             {:keys [card_ids], :as body} :- [:map
                                              [:card_ids [:sequential ms/PositiveInt]]]
             request :- [:map
                         [:form-params :map]]]
            (neat))
    '{:method :post
      :route {:path "/move"}
      :docstr "Moves a number of Cards to a single collection or dashboard."
      :params {:route   {:binding _route-params}
               :query   {:binding _query-params}
               :body    {:binding {:keys [card_ids], :as body}
                         :schema [:map [:card_ids [:sequential ms/PositiveInt]]]}
               :request {:binding request
                         :schema [:map [:form-params :map]]}}
      :body [(neat)]}

    ;; async
    '(:post "/move"
            [_route-params
             _query-params
             {:keys [card_ids], :as body} :- :map
             _request
             respond
             raise]
            (try
              (respond (wow))
              (catch Throwable e
                (raise e))))
    '{:method :post
      :route  {:path "/move"}
      :params {:route   {:binding _route-params}
               :query   {:binding _query-params}
               :body    {:binding {:keys [card_ids], :as body}, :schema :map}
               :request {:binding _request}
               :respond {:binding respond}
               :raise   {:binding raise}}
      :body [(try
               (respond (wow))
               (catch Throwable e (raise e)))]}))

(mr/def ::id pos-int?)

;; referenced only inside quoted defendpoint args that parse-args resolves at runtime
#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private RouteParams
  [:map
   [:id [:string {:api/regex #"[abc]{4}"}]]])

(deftest ^:parallel parse-args-regexes-test
  (are [args expected] (=? expected
                           (binding [*ns* (the-ns 'metabase.api.macros-test)]
                             (#'api.macros/parse-args args)))
    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id pos-int?]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[0-9]+"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id uuid?]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- [:map
                              [:id ::id]]]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[0-9]+"}}}

    '(:post "/move/:id"
            [{:keys [id]} :- RouteParams]
            (neat))
    {:route {:path "/move/:id", :regexes {:id #"[abc]{4}"}}}))

(deftest ^:parallel multipart-tempfile-cleanup-on-throw-test
  (testing "tempfiles are deleted when the handler throws, e.g. on a param validation 400"
    (let [file-1  (java.io.File/createTempFile "cleanup-test" nil)
          file-2  (java.io.File/createTempFile "cleanup-test" nil)
          request {:multipart-params {"file"     {:filename "a.csv", :tempfile file-1}
                                      ;; duplicate part names arrive as a vector of values
                                      "sneaky"   [{:filename "b.csv", :tempfile file-2}]
                                      "some_id"  "123"}}
          handler (api.macros/wrap-multipart-tempfile-cleanup
                   (fn [_request]
                     (throw (ex-info "Invalid request" {:status-code 400}))))]
      (is (thrown-with-msg? Exception #"Invalid request" (handler request)))
      (is (not (.exists file-1)))
      (is (not (.exists file-2))))))

(deftest ^:parallel multipart-tempfile-cleanup-on-raise-test
  (testing "async arity: tempfiles are deleted when the handler raises"
    (let [file    (java.io.File/createTempFile "cleanup-test" nil)
          request {:multipart-params {"file" {:filename "a.csv", :tempfile file}}}
          raised  (atom nil)
          handler (api.macros/wrap-multipart-tempfile-cleanup
                   (fn [_request _respond raise]
                     (raise (ex-info "Invalid request" {:status-code 400}))))]
      (handler request
               (fn [_response] (is false "respond should not be called"))
               (fn [e] (reset! raised e)))
      (is (some? @raised))
      (is (not (.exists file))))))

(deftest ^:parallel multipart-tempfile-preserved-on-success-test
  (testing "tempfiles are left alone when the handler completes (it owns and deletes what it consumes)"
    (let [file    (java.io.File/createTempFile "cleanup-test" nil)
          request {:multipart-params {"file" {:filename "a.csv", :tempfile file}}}
          handler (api.macros/wrap-multipart-tempfile-cleanup (fn [_request] :ok))]
      (try
        (is (= :ok (handler request)))
        (is (.exists file))
        (finally (.delete file))))))

(deftest ^:parallel parse-args-metadata-test
  (testing "metadata map is parsed correctly"
    (are [args expected] (= expected
                            (#'api.macros/parse-args args))
      '(:get "/test"
             "A test endpoint."
             {:deprecated "0.57.0"}
             []
             (test))
      '{:method :get
        :route {:path "/test"}
        :docstr "A test endpoint."
        :metadata {:deprecated "0.57.0"}
        :params {}
        :body [(test)]}

      '(:get "/test"
             {:multipart true}
             []
             (test))
      '{:method :get
        :route {:path "/test"}
        :metadata {:multipart true}
        :params {}
        :body [(test)]}

      '(:post "/test"
              "Deprecated endpoint."
              {:deprecated "0.50.0", :multipart true}
              [_route-params
               _query-params]
              (test))
      '{:method :post
        :route {:path "/test"}
        :docstr "Deprecated endpoint."
        :metadata {:deprecated "0.50.0", :multipart true}
        :params {:route {:binding _route-params}, :query {:binding _query-params}}
        :body [(test)]})))
