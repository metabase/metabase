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

(def ^:private closed-params-endpoint
  (api.macros/defendpoint :post "/closed-params-test/:id"
    "Echoes back the params the handler was given."
    [route-params :- [:map [:id :int]]
     query-params :- [:map [:q {:optional true} :int]]
     body-params  :- [:map [:b :int] [:nested {:optional true} [:map [:keep :int]]]]]
    {:route route-params, :query query-params, :body body-params}))

(defn- call-with-params [endpoint route-params query-params body-params]
  (:body (api.macros/call-core-fn endpoint route-params query-params body-params nil)))

(deftest ^:parallel closed-params-test
  (let [endpoint closed-params-endpoint]
    (testing "declared params reach the handler"
      (is (= {:route {:id 1}, :query {:q 2}, :body {:b 3}}
             (call-with-params endpoint {:id 1} {:q 2} {:b 3}))))
    (testing "a param the endpoint does not declare is stripped before the handler sees it"
      (are [route-params query-params body-params] (= {:route {:id 1}, :query {:q 2}, :body {:b 3}}
                                                      (call-with-params endpoint route-params query-params body-params))
        {:id 1, :sneaky 1} {:q 2}            {:b 3}
        {:id 1}            {:q 2, :sneaky 1} {:b 3}
        {:id 1}            {:q 2}            {:b 3, :sneaky 1}))
    (testing "only the top level is stripped -- maps nested inside a param keep their undeclared keys"
      (is (= {:route {:id 1}, :query {:q 2}, :body {:b 3, :nested {:keep 4, :undeclared 5}}}
             (call-with-params endpoint {:id 1} {:q 2} {:b 3, :nested {:keep 4, :undeclared 5}}))))))

(deftest ^:parallel open-params-test
  (testing "an endpoint can opt out of stripping by specifying :closed itself"
    (let [endpoint (api.macros/defendpoint :post "/open-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:map {:closed false} [:b :int]]]
                     body)]
      (is (= {:b 3, :sneaky 1}
             (call-with-params endpoint nil nil {:b 3, :sneaky 1})))))
  (testing "a hand-closed map still rejects undeclared params instead of dropping them"
    (let [endpoint (api.macros/defendpoint :post "/hand-closed-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:map {:closed true} [:b :int]]]
                     body)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid body"
           (call-with-params endpoint nil nil {:b 3, :sneaky 1})))))
  (testing "a schema with no entries declares nothing, so nothing is stripped"
    (let [endpoint (api.macros/defendpoint :post "/unschematized-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- :map]
                     body)]
      (is (= {:b 3, :sneaky 1}
             (call-with-params endpoint nil nil {:b 3, :sneaky 1}))))))

(mr/def ::body [:map [:b :int]])

(deftest ^:parallel permitted-param-keys-test
  (testing "the params a schema names are the union of the params the schemas inside it name"
    (are [schema expected] (= expected
                              (#'api.macros/permitted-param-keys schema))
      [:map [:a :int]]                                    #{:a}
      ::body                                              #{:b}
      [:maybe ::body]                                     #{:b}
      [:merge [:map [:a :int]] [:map [:b :int]]]          #{:a :b}
      [:and [:map [:a :int]] [:map [:b :int]]]            #{:a :b}
      ;; a request only matches one branch of an `:or`/`:multi`, so the union never drops a key some branch wanted
      [:or [:map [:a :int]] [:map [:b :int]]]             #{:a :b}
      [:multi {:dispatch :t}
       [1 [:map [:t :int] [:a :int]]]
       [2 [:map [:t :int] [:b :int]]]]                    #{:t :a :b}
      ;; a `[:fn ...]` names nothing and is skipped, so the `:map` alongside it is taken to name every param the
      ;; schema accepts
      [:and [:map [:a :int]] [:fn map?]]                  #{:a}
      ;; ...which is wrong for a schema whose `[:fn ...]` allows more than the `:map` spells out, so those name the
      ;; params directly instead
      [:and {:api/allowed-keys #{:a :b}} [:map [:a :int]] [:fn map?]] #{:a :b}
      ;; nothing names a key here
      [:map-of :keyword :any]                             nil
      [:fn map?]                                          nil))
  (testing "a `:closed` anywhere in the schema hands the decision back to its author"
    (are [schema] (= ::api.macros/hand-closed
                     (#'api.macros/permitted-param-keys schema))
      [:map {:closed true} [:a :int]]
      [:map {:closed false} [:a :int]]
      ;; a hand-closed branch must not be turned into stripping for the whole schema
      [:or [:map {:closed true} [:a :int]] [:map [:b :int]]]
      [:and [:map [:a :int]] [:map {:closed true} [:b :int]]]
      ::hand-closed-body)))

(mr/def ::hand-closed-body [:map {:closed true} [:b :int]])

(deftest ^:parallel closed-params-derived-keys-test
  (testing "params are stripped against the keys named anywhere in the schema, not just a top-level :map"
    (let [endpoint (api.macros/defendpoint :post "/derived-keys-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:merge ::body [:map [:c {:optional true} :int]]]]
                     body)]
      (is (= {:b 3, :c 4}
             (call-with-params endpoint nil nil {:b 3, :c 4, :sneaky 1})))))
  (testing "a `[:fn ...]` alongside a `:map` does not stop the `:map` naming the params"
    (let [endpoint (api.macros/defendpoint :post "/and-fn-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:and ::body [:fn map?]]]
                     body)]
      (is (= {:b 3}
             (call-with-params endpoint nil nil {:b 3, :sneaky 1})))))
  (testing "a schema whose `[:fn ...]` accepts more than its `:map` spells out names the params directly"
    (let [endpoint (api.macros/defendpoint :post "/allowed-keys-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:and {:api/allowed-keys #{:b :extra}} ::body [:fn map?]]]
                     body)]
      (is (= {:b 3, :extra 4}
             (call-with-params endpoint nil nil {:b 3, :extra 4, :sneaky 1})))))
  (testing "a schema that names no params at all is left open"
    (let [endpoint (api.macros/defendpoint :post "/open-derived-keys-params-test"
                     "Echoes back its body."
                     [_route-params
                      _query-params
                      body :- [:map-of :keyword :any]]
                     body)]
      (is (= {:b 3, :sneaky 1}
             (call-with-params endpoint nil nil {:b 3, :sneaky 1}))))))

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
