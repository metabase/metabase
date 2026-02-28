(ns metabase-enterprise.replacement.test-util
  "Shared test helpers for replacement / source-swap tests."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn wait-for-result-metadata
  "Poll until `result_metadata` is populated on the card, up to `timeout-ms` (default 5000)."
  ([card-id] (wait-for-result-metadata card-id 5000))
  ([card-id timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
         (if (seq metadata)
           metadata
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 200)
                 (recur))
             (throw (ex-info "Timed out waiting for result_metadata" {:card-id card-id})))))))))

(defn card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn native-card-sourced-from
  "Create a native card map that references `inner-card` via {{#id}}."
  [card-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id inner-card) "}}"))
     :visualization_settings {}}))

(defmacro with-restored-card-queries
  "Snapshots every card's `dataset_query` before `body` and restores them
  afterwards, so that swap-source side-effects on pre-existing cards don't
  leak between tests."
  [& body]
  `(let [snapshot# (into {} (t2/select-fn->fn :id :dataset_query :model/Card))]
     (try
       ~@body
       (finally
         (doseq [[id# old-query#] snapshot#
                 :let [current# (t2/select-one-fn :dataset_query :model/Card :id id#)]
                 :when (and (some? old-query#) (not= old-query# current#))]
           (t2/update! :model/Card id# {:dataset_query old-query#}))))))

(defn make-native-query
  "Build a minimal pMBQL native dataset-query with the given SQL and template-tags."
  [sql template-tags]
  {:stages [{:lib/type      :mbql.stage/native
             :native        sql
             :template-tags template-tags}]})
