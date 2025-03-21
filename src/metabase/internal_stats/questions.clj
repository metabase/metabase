(ns metabase.internal-stats.questions
  (:require
   [metabase.db :as db]
   [metabase.internal-stats.util :as u]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(defn- and-not-nil
  ([not-nil-field]
   (and-not-nil nil not-nil-field))
  ([case-boolean not-nil-field]
   (cond->> [:!= not-nil-field nil]
     case-boolean (conj [:and case-boolean]))))

(defn- card-has-params
  []
  (condp = (db/db-type)
    :mysql [:json_contains_path
            :dataset_query
            [:inline "one"]
            [:inline "$.native.\"template-tags\".*"]]
    :postgres [:jsonb_path_exists
               [:cast :dataset_query :jsonb]
               [:inline "$.native.\"template-tags\" ? (exists(@.*))"]]))

(defn- contains-embedding-param
  [param]
  (condp = (db/db-type)
    :mysql [:!= [:json_search
                 :embedding_params
                 [:inline "one"]
                 [:inline param]]
            nil]
    :postgres [:jsonb_path_exists
               [:cast :embedding_params :jsonb]
               [:inline (str "$.* ? (@ == \"" param "\")")]]))

(def ^:private embedding-on [:= :enable_embedding [:inline true]])

(defn question-statistics-all-time
  "Get metrics based on questions "
  []
  (let [json-supported? (contains? #{:mysql :mariadb :postgres} (db/db-type))]
    (t2/select-one (cond-> [:model/Card
                            [:%count.* :total]
                            [(u/count-case [:= [:inline "native"] :query_type])
                             :native]
                            [(u/count-case [:!= [:inline "native"] :query_type])
                             :gui]
                            [(u/count-case [:!= :dashboard_id nil])
                             :is_dashboard_question]
                            [(u/count-case [:= :enable_embedding [:inline true]])
                             :total_embedded]
                            [(u/count-case (and-not-nil :public_uuid))
                             :total_public]]
                                ;; json_exists/contains which we use to query json encoded data stored in text
                                ;; columns is not supported on h2 databases, so we exclude these stats when
                                ;; the app db is h2.
                     json-supported? (conj
                                      [(u/count-case (card-has-params))
                                       :with_params]
                                      [(u/count-case (and-not-nil (card-has-params) :public_uuid))
                                       :with_params_public]
                                      [(u/count-case [:and embedding-on (card-has-params)])
                                       :with_params_embedded]
                                      [(u/count-case [:and (contains-embedding-param "enabled")
                                                      embedding-on])
                                       :with_enabled_params]
                                      [(u/count-case [:and (contains-embedding-param "locked")
                                                      embedding-on])
                                       :with_locked_params]
                                      [(u/count-case [:and (contains-embedding-param "disabled")
                                                      embedding-on])
                                       :with_disabled_params]))
                   {:where (mi/exclude-internal-content-hsql :model/Card)})))
