(ns metabase-enterprise.metabot.tools.api-test
  "Tests for EE-only metabot tool handlers (transforms and python libraries).
   These test the handler functions directly rather than via HTTP endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms-write :as metabot.tools.transforms-write]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.transforms :as metabot.tools.transforms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest get-transforms-test
  (mt/with-premium-features #{:metabot-v3 :transforms-basic :transforms-python}
    (mt/with-temp [:model/Transform t1 {:name        "People Transform"
                                        :description "Simple select on People table"
                                        :source      {:type  "query"
                                                      :query (lib/native-query (mt/metadata-provider) "SELECT * FROM PEOPLE")}
                                        :target      {:type "table"
                                                      :name "t1_table"}}
                   :model/Transform t2 {:name        "MBQL Transform"
                                        :description "Simple MBQL query on Products table"
                                        :source      {:type  "query"
                                                      :query (mt/mbql-query products)}
                                        :target      {:type "table"
                                                      :name "t2_table"}}
                   :model/Transform t3 {:name        "Python Transform"
                                        :description "Simple python transform"
                                        :source      {:type            "python"
                                                      :source-database (mt/id)
                                                      :body            "print('hello world')"
                                                      :source-tables   []}
                                        :target      {:type "table"
                                                      :name "t3_table"}}]
      (testing "Non-superuser gets 403"
        (mt/with-current-user (mt/user->id :rasta)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"You don't have permissions to do that"
               (metabot.tools.transforms/get-transforms {})))))
      (testing "Superuser gets native and python transforms (not plain MBQL)"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [result    (metabot.tools.transforms/get-transforms {})
                test-ids  #{(:id t1) (:id t2) (:id t3)}
                filtered  (->> (:structured_output result)
                               (filter #(test-ids (:id %)))
                               (sort-by :id))]
            ;; t2 (non-native MBQL) should be excluded
            (is (= (map :id filtered) [(:id t1) (:id t3)]))
            (is (=? [{:id          (:id t1)
                      :name        "People Transform"
                      :description "Simple select on People table"}
                     {:id          (:id t3)
                      :name        "Python Transform"
                      :description "Simple python transform"}]
                    filtered))))))))

(deftest get-transform-details-test
  (mt/with-premium-features #{:metabot-v3 :transforms-basic :transforms-python}
    (mt/with-temp [:model/Transform t1 {:name        "People Transform"
                                        :description "Simple select on People table"
                                        :source      {:type  "query"
                                                      :query (mt/native-query {:query "SELECT * FROM PEOPLE"})}
                                        :target      {:type "table"
                                                      :name "t1_table"}}
                   :model/Transform t2 {:name        "Python Transform"
                                        :description "Simple Python transform"
                                        :source      {:type            "python"
                                                      :body            "print('hello world')"
                                                      :source-database (mt/id)
                                                      :source-tables   []}
                                        :target      {:type     "table"
                                                      :name     "t2_table"
                                                      :database (mt/id)}}]
      (testing "Non-superuser gets 403"
        (mt/with-current-user (mt/user->id :rasta)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"You don't have permissions to do that"
               (metabot.tools.transforms/get-transform-details {:transform-id (:id t1)})))))
      (testing "Non-existent transform returns 404"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"Not found"
               (metabot.tools.transforms/get-transform-details {:transform-id (+ 10000 (:id t2))})))))
      (testing "Superuser can get transform details"
        (mt/with-current-user (mt/user->id :crowberto)
          (doseq [transform [t1 t2]]
            (testing (:name transform)
              (is (=? {:structured_output {:id          (:id transform)
                                           :name        (:name transform)
                                           :description (:description transform)
                                           :entity_id   (:entity_id transform)
                                           :target      {:name (:name (:target transform))}}}
                      (metabot.tools.transforms/get-transform-details {:transform-id (:id transform)}))))))))))

(deftest get-transform-python-library-details-test
  (mt/with-premium-features #{:metabot-v3 :python-transforms :transforms-basic}
    (let [saved-python-library (t2/select-one :model/PythonLibrary :path "common.py")]
      (when (seq saved-python-library)
        (t2/delete! :model/PythonLibrary))
      (try
        (testing "With no Python library present, throws 404"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"Not found"
                 (metabot.tools.transforms-write/get-transform-python-library-details {:path "common.py"})))))
        (mt/with-temp [:model/PythonLibrary lib1 {:path   "common.py"
                                                  :source "def hello():\n    return 'world'"}]
          (testing "Non-superuser gets 403"
            (mt/with-current-user (mt/user->id :rasta)
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                   (metabot.tools.transforms-write/get-transform-python-library-details {:path (:path lib1)})))))
          (testing "Non-existent library path throws 400"
            (mt/with-current-user (mt/user->id :crowberto)
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo #"Invalid library path"
                   (metabot.tools.transforms-write/get-transform-python-library-details {:path "nonexistent.py"})))))
          (testing "Superuser can get library details"
            (mt/with-current-user (mt/user->id :crowberto)
              (is (=? {:structured_output {:source (:source lib1)
                                           :path   (:path lib1)}}
                      (metabot.tools.transforms-write/get-transform-python-library-details {:path (:path lib1)}))))))
        (finally
          (when (seq saved-python-library)
            (t2/insert! :model/PythonLibrary saved-python-library)))))))
