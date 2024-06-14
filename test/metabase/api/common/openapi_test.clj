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

(api/defendpoint POST "/export"
  "docstring"
  [:as {{:strs [collection settings]}
        :query-params}]
  {collection [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   settings   [:maybe ms/BooleanValue]}
  {:collections collection :settings settings})

(api/define-routes)

;;; tests

(deftest ^:parallel fix-locations-test
  (is (=? {:properties {:value {:$ref "#/components/schemas/metabase.lib.schema.common~1non-blank-string"}}}
         (#'openapi/fix-locations (mjs/transform [:map [:value ms/NonBlankString]])))))

(deftest ^:parallel path->openapi-test
  (is (= "/{model}/{yyyy-mm}"
         (#'openapi/path->openapi "/:model/:yyyy-mm"))))

(deftest ^:parallel collect-routes-test
  (is (=? [{:path "/export"}
           {:path "/{id}"}
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
           {:parameters [{:in          :path
                          :name        :id
                          :required    true
                          :description some?
                          :schema      {:type    "integer"
                                        :minimum 1}}]
            ;; TODO: no :requestBody since we did not spec anything
            }}
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
                          :schema   {:type "boolean"}}]}}
          (#'openapi/defendpoint->path-item nil "/export" #'POST_export))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}"        {:get  {}
                                        :post {}}
                        "/{id}/upload" {:post {}}}
           :components {:schemas {"metabase.lib.schema.common/non-blank-string"
                                  {:allOf [{:type "string", :minLength 1}
                                           {}]}}}}
         (openapi/openapi-object #'routes))))
