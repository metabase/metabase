(ns metabase.api.common.openapi-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.core :refer [GET POST]]
   [malli.json-schema :as mjs]
   [metabase.api.common :as api]
   [metabase.api.common.openapi :as openapi]
   [metabase.api.routes :as routes]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;;; json-schema upgrades

(deftest json-schema-conversion
  (testing ":maybe turns into optionality"
    (is (= {:type       "object"
            :required   []
            :properties {:name {:type "string"}}}
           (#'openapi/fix-json-schema
            (mjs/transform [:map [:name [:maybe string?]]])))))

  (testing ":json-schema basically works (see definition of NonBlankString)"
    (is (=? {:description map?
             :$ref        "#/definitions/metabase.lib.schema.common~1non-blank-string",
             :definitions {"metabase.lib.schema.common/non-blank-string" {:type "string", :minLength 1}}}
            (mjs/transform ms/NonBlankString))))

  (testing "maps-with-unique-key do not generate weirdness"
    (is (=? {:description map?
             :type        "array"
             :items       {:type       "object"
                           :required   [:id]
                           :properties {:id {:type "integer"}}}}
            (#'openapi/fix-json-schema
             (mjs/transform (ms/maps-with-unique-key [:sequential [:map [:id :int]]] :id))))))

  (testing "nested data structures are still fixed up"
    (is (=? {:type  "array"
             :items {:type       "object"
                     :properties {:params {:type  "array"
                                           :items {:type "string"}}}}}
            (#'openapi/fix-json-schema
             (mjs/transform [:sequential [:map
                                          [:params {:optional true} [:maybe [:sequential :string]]]]]))))))

;;; inner helpers

(deftest ^:parallel parse-compojure-test
  (are [res args] (= res (#'openapi/compojure-query-params args))
    [:id :value] '[id value]
    [:id :value] '[id :as {{:strs [value]} :query-params}]
    [:id]        '[id :as {raw-params :params}]
    [:count]     '[:as {{c :count} :query-params}])
  (are [res args] (= res (#'openapi/compojure-renames args))
    {:c :count} '[:as {{c :count} :query-params}]))

;;; definitions

(api/defendpoint GET "/:id"
  "docstring"
  [id]
  {id ms/PositiveInt}
  {:id (str id)})

(api/defendpoint POST "/:id"
  "docstring"
  [id value]
  {id    ms/PositiveInt
   value ms/NonBlankString}
  {:id    (str id)
   :value value})

(api/defendpoint ^:multipart POST "/:id/upload"
  "docstring"
  [id :as {{:strs [file]} :multipart-params}]
  {id   ms/PositiveInt
   file (mu/with ms/File
                 {:description "File to upload"})}
  {:id id :data file})

(api/defendpoint POST "/export"
  "docstring"
  [:as {{:strs [collection settings data-model]} :query-params}]
  {collection [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   settings   [:maybe ms/BooleanValue]
   data-model ms/MaybeBooleanValue}
  {:collections collection :settings settings})

(api/defendpoint GET "/rename"
  "this one renames query parameter trying to trick us"
  [:as {{c :count} :query-params}]
  {c ms/PositiveInt}
  {:count c})

(api/defendpoint PUT "/complex/:id"
  "More complex body schema"
  [id :as {data :body}]
  {id   ms/PositiveInt
   data [:map
         [:name {:optional true} [:maybe ms/NonBlankString]]
         [:dashcards (ms/maps-with-unique-key
                      [:sequential [:map
                                    [:id int?]
                                    [:params {:optional true} [:maybe [:sequential [:map
                                                                                    [:param_id ms/NonBlankString]
                                                                                    [:target  :any]]]]]]]
                      :id)]]}
  {:id id :data data})

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
            (sort-by :path (#'openapi/collect-routes #'routes)))))
  (testing "every top-level route only uses middlewares which correctly pass metadata\n"
    (doseq [route (-> #'routes/routes meta :routes)
            :when (meta route)
            :let  [m (meta route)]]
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
          (#'openapi/defendpoint->path-item nil "/{id}" #'GET_:id)))
  (is (=? {:post
           {:parameters [{:in          :path
                          :name        :id
                          :required    true
                          :description some?
                          :schema      {:type    "integer"
                                        :minimum 1}}
                         {:in       :query,
                          :name     :value,
                          :required true,
                          :schema   {:$ref "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}}]}}
          (#'openapi/defendpoint->path-item nil "/{id}" #'POST_:id)))
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
          (#'openapi/defendpoint->path-item nil "/{id}" #'POST_:id_upload)))
  (is (=? {:post
           {:parameters [{:in       :query
                          :name     :collection
                          :required false
                          :schema   {:type "array",
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
          (#'openapi/defendpoint->path-item nil "/export" #'POST_export)))
  (is (=? {:get {:parameters [{:in       :query
                               :name     :count
                               :required false
                               :schema   {:type "integer" :minimum 1}}]}}
          (#'openapi/defendpoint->path-item nil "/rename" #'GET_rename)))
  (is (=? {:put
           {:summary "PUT /complex/{id}"
            :parameters
            [{:in          :path
              :name        :id
              :required    true
              :schema      {:type "integer", :minimum 1}
              :description map?}]
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
                  {:name      {:description map?
                               :$ref        "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}
                   :dashcards {:type        "array"
                               :description map?
                               :items       {:type       "object"
                                             :required   [:id]
                                             :properties {:id     {:type "integer"}
                                                          :params {:type        "array"
                                                                   :items       {:type       "object"
                                                                                 :required   [:param_id :target]
                                                                                 :properties {:param_id {}
                                                                                              :target   {}}}}}}}}}}}}}}}}
          (#'openapi/defendpoint->path-item nil "/complex/{id}" #'PUT_complex_:id))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}"        {:get  {}
                                        :post {}}
                        "/{id}/upload" {:post {}}}
           :components {:schemas {"metabase.lib.schema.common/non-blank-string" {:type "string", :minLength 1}}}}
          (openapi/openapi-object #'routes))))

(deftest ^:parallel openapi-all-routes
  (is (openapi/openapi-object #'routes/routes)))
