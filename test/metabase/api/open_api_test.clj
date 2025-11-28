(ns metabase.api.open-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-routes.core :as routes]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;;; definitions

(api.macros/defendpoint :get "/:id"
  "docstring"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  {:id (str id)})

(api.macros/defendpoint :post "/:id"
  "docstring"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [value]} :- [:map
                       [:value ::lib.schema.common/non-blank-string]]]
  {:id    (str id)
   :value value})

(api.macros/defendpoint :post "/export"
  "docstring"
  [_route-params
   {:keys [collection settings]} :- [:map
                                     [:collection [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
                                     [:settings   [:maybe ms/BooleanValue]]
                                     [:data-model ms/MaybeBooleanValue]]]
  {:collections collection :settings settings})

(api.macros/defendpoint :get "/rename"
  "this one renames query parameter trying to trick us (actually doesn't really trick us much anymore with defendpoint 2)"
  [_route-params
   {c :count} :- [:map
                  [:count {:optional true} ms/PositiveInt]]]
  {:count c})

(api.macros/defendpoint :put "/complex/:id"
  "More complex body schema"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [data]} :- [:map
                      [:data [:map
                              [:name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
                              [:dashcards (ms/maps-with-unique-key
                                           [:sequential [:map
                                                         [:id int?]
                                                         [:params {:optional true} [:maybe [:sequential [:map
                                                                                                         [:param_id ::lib.schema.common/non-blank-string]
                                                                                                         [:target  :any]]]]]]]
                                           :id)]]]]]
  {:id id :data data})

(api.macros/defendpoint :post "/:id/upload"
  "docstring"
  {:multipart true}
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   _body
   {{:strs [file]} :multipart-params, :as _request} :- [:map
                                                        [:multipart-params
                                                         [:map
                                                          [:file (mu/with ms/File {:description "File to upload"})]]]]]
  {:id id :data file})

(deftest ^:parallel defendpoint->openapi-test
  (is (=? {:get
           {:parameters [{:in          :path
                          :name        "id"
                          :required    true
                          :description some?
                          :schema      {:type    :integer
                                        :minimum 1}}]}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/{id}"])))))

(deftest ^:parallel defendpoint->openapi-test-2
  (is (=? {:post
           {:parameters [{:in          :path
                          :name        "id"
                          :required    true
                          :description some?
                          :schema      {:type    :integer
                                        :minimum 1}}
                         {:in       :query
                          :name     "value"
                          :required true
                          :schema   {:$ref "#/components/schemas/metabase.lib.schema.common.non-blank-string"}}]}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/{id}"])))))

(deftest ^:parallel multipart-defendpoint->openapi-test
  ;; multipart defendpoint 2 isn't implemented yet, so this only tests defendpoint 1 (for now)
  (is (=? {:post
           {:parameters  [{:in          :path
                           :name        "id"
                           :required    true
                           :description some?
                           :schema      {:type    :integer
                                         :minimum 1}}]
            :requestBody {:content {"multipart/form-data"
                                    {:schema
                                     {:type       :object
                                      :properties {"file" {}}
                                      :required   ["file"]}}}}}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/{id}/upload"])))))

(deftest ^:parallel defendpoint->openapi-test-3
  (is (=? {:post
           {:parameters [{:in       :query
                          :name     "collection"
                          :required true
                          :schema   {:oneOf [{:type :array :items {:type :integer :minimum 1}}
                                             {:type :null}]}}
                         {:in       :query
                          :name     "settings"
                          :required true
                          :schema   {:oneOf [{:type :boolean} {:type :null}]}}
                         {:in       :query
                          :name     "data-model"
                          :required false
                          :schema   {:type :boolean}}]}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/export"])))))

(deftest ^:parallel defendpoint->openapi-renamed-parameters-test
  (is (=? {:get {:parameters [{:in       :query
                               :name     "count"
                               :required false
                               :schema   {:type :integer :minimum 1}}]}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/rename"])))))

(deftest ^:parallel defendpoint->openapi-complex-test
  (is (=? {:put
           {:summary "PUT /complex/{id}"
            :parameters
            [{:in          :path
              :name        "id"
              :required    true
              :schema      {:type :integer, :minimum 1}
              :description string?}]
            :requestBody
            {:content
             {"application/json"
              {:schema
               {:type     :object
                :required ["data"]
                :properties
                {"data"
                 {:type     :object
                  :required ["dashcards"]
                  :properties
                  {"name"      {:oneOf [{:$ref "#/components/schemas/metabase.lib.schema.common.non-blank-string"}
                                        {:type :null}]}
                   "dashcards" {:type :array
                                :description string?
                                :items       {:type       :object
                                              :required   ["id"]
                                              :properties {"id"     {:type :integer}
                                                           "params" {:oneOf [{:type  :array
                                                                              :items {:type       :object
                                                                                      :required   ["param_id" "target"]
                                                                                      :properties {"param_id" {}
                                                                                                   "target"   {}}}}
                                                                             {:type :null}]}}}}}}}}}}}}}
          (-> (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) "")
              (get-in [:paths "/complex/{id}"])))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}/upload" {:post {}}
                        "/{id}"        {:get  {}
                                        :post {}}}
           :components {:schemas {"metabase.lib.schema.common.non-blank-string" {:type :string, :minLength 1}}}}
          (open-api/open-api-spec (api.macros/ns-handler 'metabase.api.open-api-test) ""))))

(deftest ^:parallel openapi-all-routes
  (testing "Make sure we can successfully generate an OpenAPI spec for the entire API"
    (is (open-api/root-open-api-object #'routes/routes))))

(deftest ^:parallel get-core-fn!-test
  (is (= {:status 200, :headers {}, :body 12345}
         (->
          (api.macros/defendpoint :get "add/:a"
            "Adds id, qp-one, qp-two, and body."
            [{:keys [a]} :- [:map [:a :int]]
             {:keys [b c]} :- [:map [:b :int] [:c :int]]
             {:keys [d]} :- [:map [:d :int]]
             {{e :e} :headers} :- [:map [:headers [:map [:e :int]]]]]
            (+ a b c d e))
          (api.macros/call-core-fn
           {:a 5}                   ;; route params
           {:b 40 :c 300}           ;; query params
           {:d 2000}                ;; body
           {:headers {:e "10000"}}) ;; the entire ring request map
          ))))
