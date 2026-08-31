(ns metabase.api.macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli.registry :as mr]))

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
      :params {:route {:binding _route-params, :schema [:map]}, :query {:binding _query-params, :schema [:map]}}
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
      :params {:route   {:binding _route-params, :schema [:map]}
               :query   {:binding _query-params, :schema [:map]}
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
      :params {:route   {:binding _route-params, :schema [:map]}
               :query   {:binding _query-params, :schema [:map]}
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
        :params {:route {:binding _route-params, :schema [:map]}, :query {:binding _query-params, :schema [:map]}}
        :body [(test)]})))

(deftest ^:parallel decode-strips-undeclared-keys-test
  (testing "request decoding drops keys the schema does not name, so an open map cannot carry values downstream"
    (are [schema value expected] (= expected
                                    ((#'api.macros/decoder schema) value))
      [:map [:a {:optional true} :int]]
      {:a 1, :b 2}
      {:a 1}

      ;; `{:closed false}` opts out, for the values we deliberately pass through as they arrived -- a query, viz
      ;; settings, database details, a settings bag
      [:map {:closed false} [:a {:optional true} :int]]
      {:a 1, :b 2}
      {:a 1, :b 2}

      ;; stripping recurses. A parameter's `:options` are spliced into the filter clause the parameter becomes, so an
      ;; option the schema does not name must not survive decoding. The schema stays open -- an unknown option is not
      ;; a 400 -- so this is what keeps such a key from reaching the clause.
      ::lib.schema.parameter/parameter
      {:type :string/contains, :value ["A"], :options {:case-sensitive false, :lib/uuid "not-yours"}}
      {:type :string/contains, :value ["A"], :options {:case-sensitive false}})))
