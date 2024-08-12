(ns metabase.api.common.openapi-test
  (:require
   [clojure.test :refer :all]
   [compojure.core :refer [GET POST]]
   [malli.json-schema :as mjs]
   [metabase.api.common :as api]
   [metabase.api.common.openapi :as openapi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

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
           {:path "/rename"}
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
          (#'openapi/defendpoint->path-item nil "/rename" #'GET_rename))))

(deftest ^:parallel openapi-object-test
  (is (=? {:paths      {"/{id}"        {:get  {}
                                        :post {}}
                        "/{id}/upload" {:post {}}}
           :components {:schemas {"metabase.lib.schema.common/non-blank-string"
                                  {:allOf [{:type "string", :minLength 1}
                                           {}]}}}}
         (openapi/openapi-object #'routes))))
