(ns metabase-enterprise.metabot.tools.api-test
  "Tests for EE-only metabot tool endpoints (transforms, python libraries)."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.client :as metabot-v3.client]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- ai-session-token
  ([] (ai-session-token :rasta (str (random-uuid))))
  ([metabot-id] (ai-session-token :rasta metabot-id))
  ([user metabot-id]
   (-> user mt/user->id (#'metabot-v3.client/get-ai-service-token metabot-id))))

(deftest get-transforms-test
  (mt/with-premium-features #{:metabot-v3 :transforms-basic :transforms-python}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))]
      (mt/with-temp [:model/Transform t1 {:name "People Transform"
                                          :description "Simple select on People table"
                                          :source {:type "query"
                                                   :query (lib/native-query (mt/metadata-provider) "SELECT * FROM PEOPLE")}
                                          :target {:type "table"
                                                   :name "t1_table"}}
                     :model/Transform t2 {:name "MBQL Transform"
                                          :description "Simple MQBL query on Products table"
                                          :source {:type "query"
                                                   :query (mt/mbql-query products)}
                                          :target {:type "table"
                                                   :name "t2_table"}}
                     :model/Transform t3 {:name "Python Transform"
                                          :description "Simple python transform"
                                          :source {:type "python"
                                                   :source-database (mt/id)
                                                   :body "print('hello world')"
                                                   :source-tables []}
                                          :target {:type "table"
                                                   :name "t2_table"}}]
        (testing "With insufficient permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transforms"
                                       {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                       {:conversation_id conversation-id}))))
        (testing "With superuser permissions"
          (is (=? {:structured_output [(mt/obj->json->obj (select-keys t1 [:id :entity_id :name :description :source]))
                                         ;; note: t2 not included because it's a (non-native) MBQL query
                                       (mt/obj->json->obj (select-keys t3 [:id :entity_id :name :description :source]))]
                   :conversation_id conversation-id}
                  (-> (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transforms"
                                            {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                            {:conversation_id conversation-id})
                      (update :structured_output (fn [output]
                                                   (->> output
                                                        (filter #(#{(:id t1) (:id t2) (:id t3)} (:id %)))
                                                        (sort-by :id))))))))))))

(deftest get-transform-test
  (mt/with-premium-features #{:metabot-v3 :transforms-basic :transforms-python}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))]
      (mt/with-temp [:model/Transform t1 {:name "People Transform"
                                          :description "Simple select on People table"
                                          :source {:type "query"
                                                   :query (mt/native-query {:query "SELECT * FROM PEOPLE"})}
                                          :target {:type "table"
                                                   :name "t1_table"}}
                     :model/Transform t2 {:name "Python Transform"
                                          :description "Simple Python transform"
                                          :source {:type "python"
                                                   :body "print('hello world')"
                                                   :source-database (mt/id)
                                                   :source-tables []}
                                          :target {:type "table"
                                                   :name "t2_table"
                                                   :database (mt/id)}}]
        (testing "With insufficient permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transform-details"
                                       {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                       {:arguments {:transform_id (:id t1)}
                                        :conversation_id conversation-id}))))
        (testing "With non-existent transform"
          (is (= "Not found."
                 (mt/user-http-request :rasta :post 404 "ee/metabot-tools/get-transform-details"
                                       {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                       {:arguments {:transform_id (+ 10000 (:id t2))}
                                        :conversation_id conversation-id}))))
        (testing "With superuser permissions"
          (doseq [transform [t1 t2]]
            (testing (:name transform)
              (is (=? {:structured_output (mt/obj->json->obj (select-keys transform [:id :entity_id :name :description :source :target]))
                       :conversation_id conversation-id}
                      (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transform-details"
                                            {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                            {:arguments {:transform_id (:id transform)}
                                             :conversation_id conversation-id}))))))))))

(deftest get-transform-python-library-details-test
  (mt/with-premium-features #{:metabot-v3 :python-transforms :transforms-basic}
    (let [conversation-id (str (random-uuid))
          rasta-ai-token (ai-session-token)
          crowberto-ai-token (ai-session-token :crowberto (str (random-uuid)))
          saved-python-library (t2/select-one :model/PythonLibrary :path "common.py")]
      (when (seq saved-python-library)
        (t2/delete! :model/PythonLibrary))
      (try
        (testing "With no Python library present"
          (is (= "Not found."
                 (mt/user-http-request :rasta :post 404 "ee/metabot-tools/get-transform-python-library-details"
                                       {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                       {:arguments {:path "common.py"}
                                        :conversation_id conversation-id}))))
        (mt/with-temp [:model/PythonLibrary lib1 {:path "common.py"
                                                  :source "def hello():\n    return 'world'"}]
          (testing "With insufficient permissions"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "ee/metabot-tools/get-transform-python-library-details"
                                         {:request-options {:headers {"x-metabase-session" rasta-ai-token}}}
                                         {:arguments {:path (:path lib1)}
                                          :conversation_id conversation-id}))))
          (testing "With non-existent library path"
            (is (=? {:allowed-paths ["common.py"]
                     :message "Invalid library path. Only 'common' is currently supported."
                     :path "nonexistent.py"}
                    (mt/user-http-request :rasta :post 400 "ee/metabot-tools/get-transform-python-library-details"
                                          {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                          {:arguments {:path "nonexistent.py"}
                                           :conversation_id conversation-id}))))
          (testing "With superuser permissions"
            (is (=? {:structured_output (select-keys lib1 [:source :path :created_at :updated_at])
                     :conversation_id conversation-id}
                    (mt/user-http-request :rasta :post 200 "ee/metabot-tools/get-transform-python-library-details"
                                          {:request-options {:headers {"x-metabase-session" crowberto-ai-token}}}
                                          {:arguments {:path (:path lib1)}
                                           :conversation_id conversation-id})))))
        (finally
          (when (seq saved-python-library)
            (t2/insert! :model/PythonLibrary saved-python-library)))))))
