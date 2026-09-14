(ns metabase.things.sync
  "Security-lint test example: data from across a boundary meeting a sink that cares which boundary."
  (:require
   [clj-http.client :as http]
   [clj-yaml.core :as yaml]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting :refer [defsetting]]
   [toucan2.core :as t2]))

(defsetting things-vendor-url "Where things are validated." :visibility :admin)
(defsetting things-vendor-api-key "The vendor key." :sensitive? true)

;; the vendor key goes to whatever host a settings manager wrote
(defn validate-thing [thing]
  (http/post (things-vendor-url) {:headers {"Authorization" (str "Bearer " (things-vendor-api-key))}
                                  :form-params thing}))

;; a stored query executed as its creator, for whoever asked
(defn run-as-creator [thing-id]
  (let [thing (t2/select-one :model/Thing thing-id)]
    (request/with-current-user (:creator_id thing)
      (qp/process-query (:dataset_query thing)))))

;; a synced document rewrites a setting and picks a model
(defn apply-document! [text]
  (let [doc (yaml/parse-string text)]
    (setting/set! :site-name (:site-name doc))
    (t2/select (:model doc))))
