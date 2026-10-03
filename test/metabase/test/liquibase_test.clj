(ns metabase.test.liquibase-test
  "Tests for metabase.test.liquibase."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.test :as mt]
   [metabase.test.liquibase :as liquibase-test])
  (:import
   (liquibase Liquibase)))

(set! *warn-on-reflection* true)

(defn- beanize-changelog [changelog]
  ;; In addition to first-level beanization, turn those field objects into beans that don't cleanly =.
  (-> (reduce #(update-in %1 %2 bean)
              (bean changelog)
              [[:changeLogParameters]
               [:changeLogParameters :contexts]
               [:changeLogParameters :labels]
               [:contexts]
               [:contextFilter]
               [:preconditions]])
      ;; Hard to make this cleanly comparable.
      (update :preconditions dissoc :nestedPreconditions)))

(deftest fresh-and-cached-migration-equality-test
  ;; We need this test to make sure that we correctly restore all mutable fields in a migration object when we give it
  ;; out to a new consumer. If Liquibase ever adds more mutable fields, this test will hopefully fail. See #81479.
  (testing "freshly created Liquibase migration and a cached/reused one are equal by each public field"
    (let [fresh (mt/with-temp-empty-app-db [conn :h2]
                  (let [liquibase-conn (#'liquibase/liquibase-connection conn)
                        database (#'liquibase/database liquibase-conn)]
                    (.getDatabaseChangeLog (liquibase/make-liquibase-from-filename
                                            (liquibase/decide-liquibase-file conn database) database))))
          cached (->> #(mt/with-temp-empty-app-db [conn :h2]
                         (let [liquibase-conn (#'liquibase/liquibase-connection conn)
                               database (#'liquibase/database liquibase-conn)]
                           (.getDatabaseChangeLog ^Liquibase (#'liquibase-test/cached-changelog-liquibase! conn database))))
                      ;; Perform twice to guarantee caching.
                      (repeatedly 2)
                      second)]
      (is (= (beanize-changelog fresh) (beanize-changelog cached))))))
