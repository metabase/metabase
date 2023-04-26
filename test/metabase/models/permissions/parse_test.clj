(ns metabase.models.permissions.parse-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.permissions.parse :as perms-parse]))

(deftest permissions->graph
  (testing "Parses each permission string to the correct graph"
    (are [x y] (= y (perms-parse/->graph [x]))
      "/db/3/"                                        {:db {3 {:data {:native :write :schemas :all}}}}
      "/db/3/native/"                                 {:db {3 {:data {:native :write}}}}
      "/db/3/schema/"                                 {:db {3 {:data {:schemas :all}}}}
      "/db/3/schema/PUBLIC/"                          {:db {3 {:data {:schemas {"PUBLIC" :all}}}}}
      "/db/3/schema/PUBLIC/table/4/"                  {:db {3 {:data {:schemas {"PUBLIC" {4 :all}}}}}}
      "/db/3/schema/PUBLIC/table/4/read/"             {:db {3 {:data {:schemas {"PUBLIC" {4 {:read :all}}}}}}}
      "/db/3/schema/PUBLIC/table/4/query/"            {:db {3 {:data {:schemas {"PUBLIC" {4 {:query :all}}}}}}}
      "/db/3/schema/PUBLIC/table/4/query/segmented/"  {:db {3 {:data {:schemas {"PUBLIC" {4 {:query :segmented}}}}}}}
      "/download/db/3/"                               {:db {3 {:download {:native :full :schemas :full}}}}
      "/download/limited/db/3/"                       {:db {3 {:download {:native :limited :schemas :limited}}}}
      "/download/db/3/native/"                        {:db {3 {:download {:native :full}}}}
      "/download/limited/db/3/native/"                {:db {3 {:download {:native :limited}}}}
      "/download/db/3/schema/"                        {:db {3 {:download {:schemas :full}}}}
      "/download/limited/db/3/schema/"                {:db {3 {:download {:schemas :limited}}}}
      "/download/db/3/schema/PUBLIC/"                 {:db {3 {:download {:schemas {"PUBLIC" :full}}}}}
      "/download/limited/db/3/schema/PUBLIC/"         {:db {3 {:download {:schemas {"PUBLIC" :limited}}}}}
      "/download/db/3/schema/PUBLIC/table/4/"         {:db {3 {:download {:schemas {"PUBLIC" {4 :full}}}}}}
      "/download/limited/db/3/schema/PUBLIC/table/4/" {:db {3 {:download {:schemas {"PUBLIC" {4 :limited}}}}}}
      "/data-model/db/3/"                             {:db {3 {:data-model {:schemas :all}}}}
      "/data-model/db/3/schema/PUBLIC/"               {:db {3 {:data-model {:schemas {"PUBLIC" :all}}}}}
      "/data-model/db/3/schema/PUBLIC/table/4/"       {:db {3 {:data-model {:schemas {"PUBLIC" {4 :all}}}}}}
      "/details/db/3/"                                {:db {3 {:details :yes}}}

      ;; v2 style
      "/data/db/3/"                                        {:db {3 {:data {:native :write}}}}
      "/data/db/3/native/"                                 {:db {3 {:data {:native :write}}}}
      "/data/db/3/schema/"                                 {:db {3 {:data {:schemas :all}}}}
      "/data/db/3/schema/PUBLIC/"                          {:db {3 {:data {:schemas {"PUBLIC" :all}}}}}
      "/data/db/3/schema/PUBLIC/table/4/"                  {:db {3 {:data {:schemas {"PUBLIC" {4 :all}}}}}}
      "/data/db/3/schema/PUBLIC/table/4/read/"             {:db {3 {:data {:schemas {"PUBLIC" {4 {:read :all}}}}}}}
      "/data/db/3/schema/PUBLIC/table/4/query/"            {:db {3 {:data {:schemas {"PUBLIC" {4 {:query :all}}}}}}}
      "/data/db/3/schema/PUBLIC/table/4/query/segmented/"  {:db {3 {:data {:schemas {"PUBLIC" {4 {:query :segmented}}}}}}}
      "/query/db/3/"                                       {:db {3 {:query {:native :write :schemas :all}}}}
      "/query/db/3/native/"                                {:db {3 {:query {:native :write}}}}
      "/query/db/3/schema/"                                {:db {3 {:query {:schemas :all}}}}
      "/query/db/3/schema/PUBLIC/"                         {:db {3 {:query {:schemas {"PUBLIC" :all}}}}}
      "/query/db/3/schema/PUBLIC/table/4/"                 {:db {3 {:query {:schemas {"PUBLIC" {4 :all}}}}}}
      "/query/db/3/schema/PUBLIC/table/4/read/"            {:db {3 {:query {:schemas {"PUBLIC" {4 {:read :all}}}}}}}
      "/query/db/3/schema/PUBLIC/table/4/query/"           {:db {3 {:query {:schemas {"PUBLIC" {4 {:query :all}}}}}}}
      "/query/db/3/schema/PUBLIC/table/4/query/segmented/" {:db {3 {:query {:schemas {"PUBLIC" {4 {:query :segmented}}}}}}})))

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
    (doseq [group (let [groups (->> {"/db/3/"                                       {:db {3 {:data {:native  :write :schemas :all}}}}

                                     "/db/3/schema/"                                {:db {3 {:data {:schemas :all}}}}
                                     "/db/3/schema/PUBLIC/"                         {:db {3 {:data {:schemas {"PUBLIC" :all}}}}}
                                     "/db/3/schema/PUBLIC/table/4/"                 {:db {3 {:data {:schemas {"PUBLIC" {4 :all}}}}}}
                                     "/db/3/schema/PUBLIC/table/4/query/"           {:db {3 {:data {:schemas {"PUBLIC" {4 {:read  :all
                                                                                                                           :query :all}}}}}}}
                                     "/db/3/schema/PUBLIC/table/4/query/segmented/" {:db {3 {:data {:schemas {"PUBLIC" {4 {:read  :all
                                                                                                                           :query :segmented}}}}}}}
                                     "/db/3/schema/PUBLIC/table/4/read/"            {:db {3 {:data {:schemas {"PUBLIC" {4 {:read :all}}}}}}}}
                                    (into [])
                                    (sort-by first))]
                    (->> groups
                         (partition-all (count groups) 1)
                         (map vec)))]
      (is (= (get-in group [0 1])
             (perms-parse/->graph (map first group)))))))

(deftest permissions->graph-collections
  (are [x y] (= y (perms-parse/->graph [x]))
    "/collection/root/"      {:collection {:root :write}}
    "/collection/root/read/" {:collection {:root :read}}
    "/collection/1/"         {:collection {1 :write}}
    "/collection/1/read/"    {:collection {1 :read}}))

(deftest combines-all-permissions
  (testing "Permision graph includes broadest permissions for all dbs in permission set"
    (is (= {:db         {3 {:data {:native  :write
                                   :schemas :all}}
                         5 {:data {:schemas {"PUBLIC" {10 {:read :all}}}}}}
            :collection {:root :write
                         1     :read}}
           (perms-parse/->graph #{"/db/3/"
                                             "/db/5/schema/PUBLIC/table/10/read/"
                                             "/collection/root/"
                                             "/collection/1/read/"})))))

(deftest block-permissions-test
  (testing "Should parse block permissions entries correctly"
    (is (= {:db {1 {:data {:schemas :block}}
                 2 {:data {:schemas :block}}}}
           (perms-parse/->graph #{"/block/db/1/" "/block/db/2/"}))))
  (testing (str "Block perms and data perms shouldn't exist together at the same time for a given DB, but if they do "
                "for some  reason, ignore the data perms and return the block perms")
    (doseq [path  ["/db/1/"
                   "/db/1/schema/"
                   "/db/1/schema/public/"
                   "/db/1/schema/public/"
                   "/db/1/schema/public/table/2/"
                   "/db/1/schema/public/table/2/read/"]
            ;; should work regardless of what order the paths come in
            :let  [paths ["/block/db/1/" path]]
            paths [paths (reverse paths)]]
      (testing (format "\nPaths = %s" (pr-str paths))
        (is (= {:db {1 {:data (merge {:schemas :block}
                                     ;; block permissions should only affect the `:schema` key. `/db/1/` also sets the
                                     ;; `:native` key. In reality, it makes no sense to have block perms AND allow native
                                     ;; access but that's not the parsing code's concern.
                                     (when (= path "/db/1/")
                                       {:native :write}))}}}
               (perms-parse/->graph paths)))))))

(deftest parser-works-for-v2-tests
  (is (= [:permission [:data-v2 "1"]]
         (#'perms-parse/parser "/data/db/1/")))
  (is (= [:permission [:query-v2 "1"]]
         (#'perms-parse/parser "/query/db/1/")))
  (is (= [:permission [:query-v2 "1" [:schemas]]]
         (#'perms-parse/parser "/query/db/1/schema/")))
  (is (= [:permission [:data-v2 "1" [:schemas]]]
         (#'perms-parse/parser "/data/db/1/schema/")))
  (is (= [:permission [:data-v2 "1" [:schemas [:schema [:schema-name ""]]]]]
         (#'perms-parse/parser "/data/db/1/schema//")))
  (is (= [:permission [:query-v2 "1" [:schemas [:schema [:schema-name ""]]]]]
         (#'perms-parse/parser "/query/db/1/schema//")))
  (is (= [:permission [:data-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"]]]]]
         (#'perms-parse/parser "/data/db/1/schema/PUBLIC/")))
  (is (= [:permission [:query-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"]]]]]
         (#'perms-parse/parser "/query/db/1/schema/PUBLIC/")))
  (is (= [:permission [:data-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"] [:table "1"]]]]]
         (#'perms-parse/parser "/data/db/1/schema/PUBLIC/table/1/")))
  (is (= [:permission [:query-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"] [:table "1"]]]]]
         (#'perms-parse/parser "/query/db/1/schema/PUBLIC/table/1/")))
  (is (= [:permission [:data-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"] [:table "1"]]]]]
         (#'perms-parse/parser "/data/db/1/schema/PUBLIC/table/1/")))
  (is (= [:permission [:query-v2 "1" [:schemas [:schema [:schema-name "PUBLIC"] [:table "1"]]]]]
         (#'perms-parse/parser "/query/db/1/schema/PUBLIC/table/1/"))))
