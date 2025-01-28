(ns metabase.api.common.openapi-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.api.common :as api]
   [metabase.api.common.openapi :as openapi]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes :as routes]
   [metabase.util.i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(comment metabase.util.i18n/keep-me)

;;; json-schema upgrades

(deftest ^:parallel json-schema-conversion
  (testing ":maybe turns into optionality"
    (is (= {:type       "object"
            :required   []
            :properties {:name {:type "string"}}}
           (#'openapi/fix-json-schema
            (mjs/transform [:map [:name [:maybe string?]]]))))))

(deftest ^:parallel json-schema-conversion-2
  (testing ":json-schema basically works (see definition of NonBlankString)"
    (is (=? {:description metabase.util.i18n.UserLocalizedString
             :$ref        "#/definitions/metabase.lib.schema.common~1non-blank-string"
             :definitions {"metabase.lib.schema.common/non-blank-string" {:type "string", :minLength 1}}}
            (mjs/transform ms/NonBlankString)))))

(deftest ^:parallel json-schema-conversion-3
  (testing "maps-with-unique-key do not generate weirdness"
    (is (=? {:description string?
             :type        "array"
             :items       {:type       "object"
                           :required   [:id]
                           :properties {:id {:type "integer"}}}}
            (#'openapi/fix-json-schema
             (mjs/transform (ms/maps-with-unique-key [:sequential [:map [:id :int]]] :id)))))))

(deftest ^:parallel json-schema-conversion-4
  (testing "nested data structures are still fixed up"
    (is (=? {:type  "array"
             :items {:type       "object"
                     :properties {:params {:type  "array"
                                           :items {:type "string"}}}}}
            (#'openapi/fix-json-schema
             (mjs/transform [:sequential [:map
                                          [:params {:optional true} [:maybe [:sequential :string]]]]]))))))

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
                       [:value ms/NonBlankString]]]
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
                              [:name {:optional true} [:maybe ms/NonBlankString]]
                              [:dashcards (ms/maps-with-unique-key
                                           [:sequential [:map
                                                         [:id int?]
                                                         [:params {:optional true} [:maybe [:sequential [:map
                                                                                                         [:param_id ms/NonBlankString]
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

(defn- find-route [method route]
  (api.macros/find-route 'metabase.api.common.openapi-test method route))

(api/define-routes)

;;; tests

(deftest ^:parallel collect-definitions-test
  (binding [openapi/*definitions* (atom [])]
    (is (=? {:properties {:value {:$ref "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}}}
            (#'openapi/mjs-collect-definitions [:map [:value ms/NonBlankString]])))
    (is (= [{"metabase.lib.schema.common/non-blank-string" {:type "string", :minLength 1}}]
           @@#'openapi/*definitions*))))

(deftest ^:parallel path->openapi-test
  (is (= "/{model}/{yyyy-mm}"
         (#'openapi/path->openapi "/:model/:yyyy-mm"))))

(deftest ^:parallel collect-routes-test
  (testing "can collect routes in simple case"
    (is (=? [{:path "/complex/{id}"}
             {:path "/export"}
             {:path "/rename"}
             {:path "/{id}"}
             {:path "/{id}"}
             {:path "/{id}/upload"}]
            (sort-by :path (#'openapi/collect-routes #'routes))))))

(deftest ^:parallel collect-routes-test-2
  (testing "every top-level route only uses middlewares which correctly pass metadata\n"
    (doseq [route (-> #'routes/routes meta :routes)
            :when (meta route)
            :let  [m (meta route)]
            :when (not= (:path m) "/docs")]
      (testing (cond-> (:path m)
                 (:doc m) (str " - " (some-> (:doc m) str/split-lines first)))
        (is (or (:method m)
                (some? (->> route meta :routes (some meta)))))))))

(deftest ^:parallel defendpoint->openapi-test
  (is (=? {:get
           {:parameters [{:in          :path
                          :name        :id
                          :required    true
                          :description some?
                          :schema      {:type    "integer"
                                        :minimum 1}}]}}
          (#'openapi/defendpoint-2->path-item nil "/{id}" (:form (find-route :get "/:id"))))))

(deftest ^:parallel defendpoint->openapi-test-2
  (is (=? {:post
           {:parameters [{:in          :path
                          :name        :id
                          :required    true
                          :description some?
                          :schema      {:type    "integer"
                                        :minimum 1}}
                         {:in       :query
                          :name     :value
                          :required true
                          :schema   {:$ref "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}}]}}
          (#'openapi/defendpoint-2->path-item nil "/{id}" (:form (find-route :post "/:id"))))))

(deftest ^:parallel multipart-defendpoint->openapi-test
  ;; multipart defendpoint 2 isn't implemented yet, so this only tests defendpoint 1 (for now)
  (is (=? {:post
           {:parameters  [{:in          :path
                           :name        :id
                           :required    true
                           :description some?
                           :schema      {:type    "integer"
                                         :minimum 1}}]
            :requestBody {:content {"multipart/form-data"
                                    {:schema
                                     {:type       "object"
                                      :properties {:file {}}
                                      :required   [:file]}}}}}}
          (#'openapi/defendpoint-2->path-item nil "/{id}" (:form (find-route :post "/:id/upload"))))))

(deftest ^:parallel defendpoint->openapi-test-3
  (is (=? {:post
           {:parameters [{:in       :query
                          :name     :collection
                          :required false
                          :schema   {:type "array"
                                     :items
                                     {:type    "integer"
                                      :minimum 1}}}
                         {:in       :query
                          :name     :settings
                          :required false
                          :schema   {:type "boolean"}}
                         {:in       :query
                          :name     :data-model
                          :required false
                          :schema   {:type "boolean"}}]}}
          (#'openapi/defendpoint-2->path-item nil "/export" (:form (find-route :post "/export"))))))

(deftest ^:parallel defendpoint->openapi-renamed-parameters-test
  (is (=? {:get {:parameters [{:in       :query
                               :name     :count
                               :required false
                               :schema   {:type "integer" :minimum 1}}]}}
          (#'openapi/defendpoint-2->path-item nil "/rename" (:form (find-route :get "/rename"))))))

(deftest ^:parallel defendpoint->openapi-complex-test
  (is (=? {:put
           {:summary "PUT /complex/{id}"
            :parameters
            [{:in          :path
              :name        :id
              :required    true
              :schema      {:type "integer", :minimum 1}
              :description string?}]
            :requestBody
            {:content
             {"application/json"
              {:schema
               {:type     "object"
                :required [:data]
                :properties
                {:data
                 {:type     "object"
                  :required [:dashcards]
                  :properties
                  {:name      {:description string?
                               :$ref        "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}
                   :dashcards {:type        "array"
                               :description string?
                               :items       {:type       "object"
                                             :required   [:id]
                                             :properties {:id     {:type "integer"}
                                                          :params {:type        "array"
                                                                   :items       {:type       "object"
                                                                                 :required   [:param_id :target]
                                                                                 :properties {:param_id {}
                                                                                              :target   {}}}}}}}}}}}}}}}}
          (#'openapi/defendpoint-2->path-item nil "/complex/{id}" (:form (find-route :put "/complex/:id"))))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}/upload" {:post {}}
                        "/{id}"        {:get  {}
                                        :post {}}}
           :components {:schemas {"metabase.lib.schema.common/non-blank-string" {:type "string", :minLength 1}}}}
          (openapi/openapi-object #'routes))))

(deftest ^:parallel openapi-all-routes
  (is (openapi/openapi-object #'routes/routes)))
