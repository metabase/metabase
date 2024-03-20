(ns metabase.api.common.openapi-test
  (:require
   [clojure.test :refer :all]
   [compojure.core :refer [GET POST]]
   [malli.json-schema :as mjs]
   [metabase.api.common :as api]
   [metabase.api.common.openapi :as openapi]
   [metabase.util.malli.schema :as ms]))

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
  [id :as {raw-params :params}]
  {id ms/PositiveInt}
  {:data (get-in raw-params ["file" :tempfile])})

(api/define-routes)

;;; tests

(deftest ^:parallel fix-locations-test
  (is (=? {:properties {:value {:$ref "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}}}
         (#'openapi/fix-locations (mjs/transform [:map [:value ms/NonBlankString]])))))

(deftest ^:parallel path->openapi-test
  (is (= "/{model}/{yyyy-mm}"
         (#'openapi/path->openapi "/:model/:yyyy-mm"))))

(deftest ^:parallel collect-routes-test
  (is (=? [{:path "/{id}"}
           {:path "/{id}"}
           {:path "/{id}/upload"}]
          (sort-by :path (#'openapi/collect-routes #'routes)))))

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
           {:parameters  [{:in          :path
                           :name        :id
                           :required    true
                           :description some?
                           :schema      {:type    "integer"
                                         :minimum 1}}]
            :requestBody {:content
                          {"application/json"
                           {:schema
                            {:type       "object",
                             :properties {:value {:description some?
                                                  :$ref        "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}},
                             :required   [:value]}}}}}}
          (#'openapi/defendpoint->path-item nil "/{id}" #'POST_:id)))
  (is (=? {:post
           {:parameters  [{:in          :path
                           :name        :id
                           :required    true
                           :description some?
                           :schema      {:type    "integer"
                                         :minimum 1}}]
            ;; TODO: no properties since we did not spec anything
            :requestBody {:content
                          {"multipart/form-data"
                           {:schema {:type "object", :properties {}}}}}}}
          (#'openapi/defendpoint->path-item nil "/{id}" #'POST_:id_upload))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}"        {:get  {}
                                        :post {}}
                        "/{id}/upload" {:post {}}}
           :components {:schemas {"metabase.lib.schema.common/non-blank-string"
                                  {:allOf [{:type "string", :minLength 1}
                                           {}]}}}}
         (openapi/openapi-object #'routes))))
