(ns metabase.models.permissions.parse-test
  (:require [clojure.test :refer :all]
            [metabase.models.permissions.parse :as parse]))

(deftest permissions->graph
  (testing "Parses each permission string to the correct graph"
    (are [x y] (= y (parse/permissions->graph [x]))
      "/db/3/"                                       {:db {3 {:native  :write
                                                              :schemas :all}}}
      "/db/3/native/"                                {:db {3 {:native :write}}}
      "/db/3/schema/"                                {:db {3 {:schemas :all}}}
      "/db/3/schema/PUBLIC/"                         {:db {3 {:schemas {"PUBLIC" :all}}}}
      "/db/3/schema/PUBLIC/table/4/"                 {:db {3 {:schemas {"PUBLIC" {4 :all}}}}}
      "/db/3/schema/PUBLIC/table/4/read/"            {:db {3 {:schemas {"PUBLIC" {4 {:read :all}}}}}}
      "/db/3/schema/PUBLIC/table/4/query/"           {:db {3 {:schemas {"PUBLIC" {4 {:query :all}}}}}}
      "/db/3/schema/PUBLIC/table/4/query/segmented/" {:db {3 {:schemas {"PUBLIC" {4 {:query :segmented}}}}}})))


(deftest combines-permissions-for-graph
  (testing "When given multiple permission hierarchies, chooses the one with the most permission"
    ;; This works by creating progressively smaller groups of permissions and asserting the constructed graph
    ;; expresses the most permissions
    ;;
    ;; On the first iteration, it tests that a permission set that includes ALL the keys below
    ;; gets converted to the graph
    ;;
    ;; {3 {:native :all :schemas :all}}
    ;;
    ;; The next iteration removes the pair ["/db/3/" {3 {:native :all :schemas :all}}] from the permission set
    ;; and asserts that the permission graph returned is the one with the next most permissions:
    ;;
    ;; {3 {:schemas :all}}
    ;;
    ;; Visually, the map is structured to mean "When the permission set includes only this key and the ones below it,
    ;; the permission graph for this key should be returned"
    (doseq [group (let [groups (->> {"/db/3/"                                       {:db {3 {:native  :write
                                                                                             :schemas :all}}}

                                     "/db/3/schema/"                                {:db {3 {:schemas :all}}}
                                     "/db/3/schema/PUBLIC/"                         {:db {3 {:schemas {"PUBLIC" :all}}}}
                                     "/db/3/schema/PUBLIC/table/4/"                 {:db {3 {:schemas {"PUBLIC" {4 :all}}}}}
                                     "/db/3/schema/PUBLIC/table/4/query/"           {:db {3 {:schemas {"PUBLIC" {4 {:read  :all
                                                                                                                    :query :all}}}}}}
                                     "/db/3/schema/PUBLIC/table/4/query/segmented/" {:db {3 {:schemas {"PUBLIC" {4 {:read  :all
                                                                                                                    :query :segmented}}}}}}
                                     "/db/3/schema/PUBLIC/table/4/read/"            {:db {3 {:schemas {"PUBLIC" {4 {:read :all}}}}}}}
                                    (into [])
                                    (sort-by first))]
                    (->> groups
                         (partition-all (count groups) 1)
                         (map vec)))]
      (is (= (get-in group [0 1])
             (parse/permissions->graph (map first group)))))))

(deftest permissions->graph-collections
  (are [x y] (= y (parse/permissions->graph [x]))
    "/collection/root/"      {:collection {:root :write}}
    "/collection/root/read/" {:collection {:root :read}}
    "/collection/1/"         {:collection {1 :write}}
    "/collection/1/read/"    {:collection {1 :read}}))

(deftest combines-all-permissions
  (testing "Permision graph includes broadest permissions for all dbs in permission set"
    (is (= {:db         {3 {:native  :write
                            :schemas :all}
                         5 {:schemas {"PUBLIC" {10 {:read :all}}}}}
            :collection {:root :write
                         1     :read}}
           (parse/permissions->graph #{"/db/3/"
                                       "/db/5/schema/PUBLIC/table/10/read/"
                                       "/collection/root/"
                                       "/collection/1/read/"})))))
