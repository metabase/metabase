(ns metabase.models.permissions-test
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [database :refer [Database]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [table :refer [Table]]]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;;; ----------------------------------------------- valid-object-path? -----------------------------------------------

(deftest valid-object-path-test
  (testing "valid paths"
    (doseq [path
            ["/db/1/"
             "/db/1/native/"
             "/db/1/schema/"
             "/db/1/schema/public/"
             "/db/1/schema/PUBLIC/"
             "/db/1/schema//"
             "/db/1/schema/1234/"
             "/db/1/schema/public/table/1/"
             "/db/1/schema/PUBLIC/table/1/"
             "/db/1/schema//table/1/"
             "/db/1/schema/public/table/1/"
             "/db/1/schema/PUBLIC/table/1/"
             "/db/1/schema//table/1/"
             "/db/1/schema/1234/table/1/"]]
      (testing path
        (is (= true
               (perms/valid-object-path? path)))))

    ;; TODO -- we need to esacpe forward-slashes as well
    (testing "We should allow backslashes in permissions paths? (#8693)"
      (is (= true
             (perms/valid-object-path? "/db/16/schema/COMPANY-NET\\john.doe/")))))

  (testing "invalid paths"
    (doseq [[reason paths]
            {"Native READ permissions are DEPRECATED as of v0.30 so they should no longer be treated as valid"
             ["/db/1/native/read/"]

             "missing trailing slashes"
             ["/db/1"
              "/db/1/native"
              "/db/1/schema"
              "/db/1/schema/public"
              "/db/1/schema/PUBLIC"
              "/db/1/schema"
              "/db/1/schema/public/db/1"
              "/db/1/schema/PUBLIC/db/1"
              "/db/1/schema//db/1"
              "/db/1/schema/public/db/1/table/2"
              "/db/1/schema/PUBLIC/db/1/table/2"
              "/db/1/schema//db/1/table/2"]

             "too many slashes"
             ["/db/1//"
              "/db/1/native//"
              "/db/1/schema/public//"
              "/db/1/schema/PUBLIC//"
              "/db/1/schema///"
              "/db/1/schema/public/db/1//"
              "/db/1/schema/PUBLIC/db/1//"
              "/db/1/schema//db/1//"
              "/db/1/schema/public/db/1/table/2//"
              "/db/1/schema/PUBLIC/db/1/table/2//"
              "/db/1/schema//db/1/table/2//"]

             "not referencing a specific object. These might be valid permissions paths but not valid paths to objects"
             ["/"
              "/db/"
              "/db/1/schema/public/db/"
              "/db/1/schema/public/db/1/table/"]

             "duplicate path components"
             ["/db/db/1/"
              "/db/1/native/native/"
              "/db/1/schema/schema/public/"
              "/db/1/schema/public/public/"
              "/db/1/schema/public/db/1/table/table/"
              "/db/1/schema/public/db/1/table/table/2/"]

             "missing beginning slash"
             ["db/1/"
              "db/1/native/"
              "db/1/schema/public/"
              "db/1/schema/PUBLIC/"
              "db/1/schema//"
              "db/1/schema/public/db/1/"
              "db/1/schema/PUBLIC/db/1/"
              "db/1/schema//db/1/"
              "db/1/schema/public/db/1/table/2/"
              "db/1/schema/PUBLIC/db/1/table/2/"
              "db/1/schema//db/1/table/2/"]

             "non-numeric IDs"
             ["/db/toucans/"
              "/db/1/schema/public/table/orders/"]

             "things that aren't even strings"
             [nil
              {}
              []
              true
              false
              (keyword "/db/1/")
              1234]

             "other invalid paths"
             ["/db/1/table/"
              "/db/1/table/2/"
              "/db/1/native/schema/"
              "/db/1/native/write/"
              "/rainforest/"
              "/rainforest/toucans/"
              ""
              "//"
              "/database/1/"
              "/DB/1/"
              "/db/1/SCHEMA/"
              "/db/1/SCHEMA/PUBLIC/"
              "/db/1/schema/PUBLIC/TABLE/1/"]}]
      (testing reason
        (doseq [path paths]
          (testing path
            (is (= false
                   (perms/valid-object-path? path)))))))))


;;; -------------------------------------------------- object-path ---------------------------------------------------

(deftest object-path-test
  (testing "valid paths"
    (doseq [[expected args] {"/db/1/"                       [1]
                             "/db/1/schema/public/"         [1 "public"]
                             "/db/1/schema/public/table/2/" [1 "public" 2]}]
      (testing (pr-str (cons 'perms/object-path args))
        (is (= expected
               (apply perms/object-path args))))))

  (testing "invalid paths"
    (testing "invalid input should throw an exception"
      (doseq [args [[]
                    [1 "public" 2 3]
                    [nil]
                    ["sales"]
                    [:sales]
                    [true]
                    [false]
                    [{}]
                    [[]]
                    [:sales]
                    [1 true]
                    [1 false]
                    [1 {}]
                    [1 []]
                    [1 :sales]
                    [1 "public" nil]
                    [1 "public" "sales"]
                    [1 "public" :sales]
                    [1 "public" true]
                    [1 "public" false]
                    [1 "public" {}]
                    [1 "public" []]]]
        (testing (pr-str (cons 'perms/object-path args))
          (is (thrown? Exception
                       (apply perms/object-path args))))))))


;;; ---------------------------------- Generating permissions paths for Collections ----------------------------------

(deftest collection-path-test
  (doseq [[perms-type f-symb] {:read      'collection-read-path
                               :readwrite 'collection-readwrite-path}
          :let                [f (ns-resolve 'metabase.models.permissions f-symb)]]
    (doseq [[input expected] {1                          {:read      "/collection/1/read/"
                                                          :readwrite "/collection/1/"}
                              {:id 1}                    {:read      "/collection/1/read/"
                                                          :readwrite "/collection/1/"}
                              collection/root-collection {:read      "/collection/root/read/"
                                                          :readwrite "/collection/root/"}}
            :let             [expected (get expected perms-type)]]
      (testing (pr-str (list f-symb input))
        (is (= expected
               (f input)))))

    (doseq [input [{} nil "1"]]
      (testing (pr-str (list f-symb input))
        (is (thrown?
             Exception
             (f input)))))))


;;; ------------------------------------------- is-permissions-for-object? -------------------------------------------

(deftest is-permissions-for-object?-test
  (doseq [[expected inputs]
          {true
           ["/"
            "/db/"
            "/db/1/"
            "/db/1/schema/"
            "/db/1/schema/PUBLIC/"
            "/db/1/schema/PUBLIC/table/1/"]

           false
           ["/db/2/"
            "/db/2/native/"
            "/db/1/schema/public/"
            "/db/1/schema/private/"
            "/db/1/schema/PUBLIC/table/2/"]}

          perms-path inputs]
    (testing (pr-str (list 'is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/"))
      (is (= expected
             (perms/is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/"))))))


;;; --------------------------------------- is-partial-permissions-for-object? ---------------------------------------

(deftest is-partial-permissions-for-object?-test
  (doseq [[expected inputs]
          {true
           ["/"
            "/db/"
            "/db/1/"
            "/db/1/schema/"
            "/db/1/schema/PUBLIC/"
            "/db/1/schema/PUBLIC/table/"
            "/db/1/schema/PUBLIC/table/1/"
            "/db/1/schema/PUBLIC/table/1/field/"
            "/db/1/schema/PUBLIC/table/1/field/2/"]

           false
           ["/db/2/"
            "/db/2/native/"]}

          perms-path inputs]
    (testing (pr-str (list 'is-partial-permissions-for-object? perms-path "/db/1/"))
      (is (= expected
             (perms/is-partial-permissions-for-object? perms-path "/db/1/"))))))


;;; ---------------------------------------------- is-permissions-set? -----------------------------------------------

(deftest is-permissions-set?-test
  (testing "valid permissions sets"
    (doseq [perms-set [#{}
                       #{"/"}
                       #{"/db/1/"}
                       #{"/db/1/"}
                       #{"/db/1/schema/"}
                       #{"/db/1/schema/public/"}
                       #{"/db/1/schema/public/table/1/"}
                       #{"/" "/db/2/"}
                       #{"/db/1/" "/db/2/schema/"}
                       #{"/db/1/schema/" "/db/2/schema/public/"}
                       #{"/db/1/schema/public/" "/db/2/schema/public/table/3/"}
                       #{"/db/1/schema/public/table/2/" "/db/3/schema/public/table/4/"}]]
      (testing (pr-str (list 'perms/is-permissions-set? perms-set))
        (is (= true
               (perms/is-permissions-set? perms-set))))))

  (testing "invalid permissions sets"
    (doseq [[group sets] {"things that aren't sets"
                          [nil {} [] true false "" 1234 :wow]

                          "things that contain invalid paths"
                          [#{"/" "/toucans/"}
                           #{"/db/1/" "//"}
                           #{"/db/1/" "/db/1/table/2/"}
                           #{"/db/1/native/schema/"}
                           #{"/db/1/schema/public/" "/kanye/"}
                           #{"/db/1/schema/public/table/1/" "/ocean/"}]}]
      (testing group
        (doseq [perms-set sets]
          (testing (pr-str (list 'perms/is-permissions-set? perms-set))
            (is (= false
                   (perms/is-permissions-set? perms-set)))))))))


;;; ------------------------------------------- set-has-full-permissions? --------------------------------------------

(deftest set-has-full-permissions?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"]
            [#{"/db/1/native/"}                                         "/db/1/native/"]]

           false
           [[#{}                                              "/db/1/schema/public/table/2/"]
            [#{"/db/1/native/"}                               "/db/1/"]
            [#{"/db/1/schema/public/"}                        "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                "/db/1/schema/public/"]
            [#{"/db/2/"}                                      "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"]]}

          [perms path] inputs]
    (testing (pr-str (list 'set-has-full-permissions? perms path))
      (is (= expected
             (perms/set-has-full-permissions? perms path))))))


;;; ------------------------------------------ set-has-partial-permissions? ------------------------------------------

(deftest set-has-partial-permissions?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/"]
            [#{"/db/1/schema/"}                                         "/db/1/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/"]
            [#{"/db/1/schema/public/"}                                  "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/schema/"]
            [#{"/db/1/schema/public/table/1/"}                          "/db/1/schema/public/"]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/"]]

           false
           [[#{}                                              "/db/1/schema/public/table/2/"]
            [#{"/db/1/schema/"}                               "/db/1/native/"]
            [#{"/db/1/native/"}                               "/db/1/schema/"]
            [#{"/db/2/"}                                      "/db/1/schema/public/table/2/"]
            [#{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"]
            [#{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"]]}

          [perms path] inputs]
    (testing (pr-str (list 'set-has-partial-permissions? perms path))
      (is (= expected
             (perms/set-has-partial-permissions? perms path))))))


;;; --------------------------------------- set-has-full-permissions-for-set? ----------------------------------------

(deftest set-has-full-permissions-for-set?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                     #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]]

           false
           [[#{}                                                        #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/2/"}                                                #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/2/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema/public/" "/db/1/schema/public/"}           #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]
            [#{"/db/3/schema//table/5/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}]]}

          [perms paths] inputs]
    (testing (pr-str (list 'set-has-full-permissions-for-set? perms paths))
      (is (= expected
             (perms/set-has-full-permissions-for-set? perms paths)))))

  (testing "If either set is invalid, it should throw an exception"
    (doseq [[perms paths] [[#{"/" "/toucans/"}           #{"/db/1/"}]
                           [#{"/db/1/" "//"}             #{"/db/1/"}]
                           [#{"/db/1/table/2/" "/db/1/"} #{"/db/1/"}]
                           [#{"/db/1/"}                  #{"/db/1/native/schema/"}]
                           [#{"/db/1/"}                  #{"/db/1/schema/public/" "/kanye/"}]
                           [#{"/db/1/"}                  #{"/ocean/" "/db/1/schema/public/table/1/"}]]]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (perms/set-has-full-permissions-for-set? perms paths))))))


;;; -------------------------------------- set-has-partial-permissions-for-set? --------------------------------------

(deftest set-has-partial-permissions-for-set?-test
  (doseq [[expected inputs]
          {true
           [[#{"/"}                                                      #{"/db/1/schema/public/table/2/" "/db/2/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}    #{"/db/1/" "/db/3/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/"}                  #{"/db/1/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                  #{"/db/1/" "/db/3/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/"}]
            [#{"/db/1/schema/"}                                          #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/public/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/" "/db/1/schema/public/table/1/"}]
            [#{"/db/1/native/"}                                          #{"/db/1/native/"}]
            [#{"/db/1/schema/public/"}                                   #{"/db/1/schema/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/"}]
            [#{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/public/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"}]]

           false
           [[#{}                                                        #{"/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/"}                                         #{"/db/1/native/"}]
            [#{"/db/1/native/"}                                         #{"/db/1/schema/"}]
            [#{"/db/2/"}                                                #{"/db/1/schema/public/table/2/"}]
            [#{"/db/2/" "/db/3/"}                                       #{"/db/1/schema/public/table/2/"}]
            [#{"/db/2/schema/public/" "/db/3/schema/public/"}           #{"/db/1/schema/public/table/2/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}   #{"/db/1/" "/db/3/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/"}                 #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/1/" "/db/3/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/"}                                         #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/public/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/" "/db/1/schema/public/table/1/" "/db/9/"}]
            [#{"/db/1/native/"}                                         #{"/db/1/native/" "/db/9/"}]
            [#{"/db/1/schema/public/"}                                  #{"/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/" "/db/9/"}]
            [#{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/public/" "/db/9/"}]
            [#{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}]]}

          [perms paths] inputs]
    (testing (pr-str (list 'set-has-partial-permissions-for-set? perms paths))
      (is (= expected
             (perms/set-has-partial-permissions-for-set? perms paths))))))


;;; ------------------------------------ perms-objects-set-for-parent-collection -------------------------------------

(deftest perms-objects-set-for-parent-collection-test
  (doseq [[input expected] {[{:collection_id 1337} :read]  #{"/collection/1337/read/"}
                            [{:collection_id 1337} :write] #{"/collection/1337/"}
                            [{:collection_id nil} :read]   #{"/collection/root/read/"}
                            [{:collection_id nil} :write]  #{"/collection/root/"}}]
    (testing (pr-str (cons 'perms-objects-set-for-parent-collection input))
      (is (= expected
             (apply perms/perms-objects-set-for-parent-collection input)))))

  (testing "invalid input"
    (doseq [[reason inputs] {"map must have `:collection_id` key"
                             [[{} :read]]

                             "must be a map"
                             [[100 :read]
                              [nil :read]]

                             "read-or-write must be `:read` or `:write`"
                             [[{:collection_id nil} :readwrite]]}
            input inputs]
      (testing reason
        (testing (pr-str (cons 'perms-objects-set-for-parent-collection input))
          (is (thrown?
               Exception
               (apply perms/perms-objects-set-for-parent-collection input))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Permissions Graph Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- test-data-graph [group]
  (get-in (perms/graph) [:groups (u/get-id group) (mt/id) :schemas "PUBLIC"]))

(deftest graph-set-partial-permissions-for-table-test
  (testing "Test that setting partial permissions for a table retains permissions for other tables -- #3888"
    (mt/with-temp PermissionsGroup [group]
      (testing "before"
        ;; first, graph permissions only for VENUES
        (perms/grant-permissions! group (perms/object-path (mt/id) "PUBLIC" (mt/id :venues)))
        (is (= {(mt/id :venues) :all}
               (test-data-graph group))))
      (testing "after"
        ;; next, grant permissions via `update-graph!` for CATEGORIES as well. Make sure permissions for VENUES are
        ;; retained (#3888)
        (perms/update-graph! [(u/get-id group) (mt/id) :schemas "PUBLIC" (mt/id :categories)] :all)
        (is (= {(mt/id :categories) :all, (mt/id :venues) :all}
               (test-data-graph group)))))))

(deftest graph-for-tables-without-schemas-test
  (testing "Make sure that the graph functions work correctly for DBs with no schemas (#4000)"
    (mt/with-temp* [PermissionsGroup [group]
                    Database         [database]
                    Table            [table    {:db_id (u/get-id database)}]]
      ;; try to grant idential permissions to the table twice
      (perms/update-graph! [(u/get-id group) (u/get-id database) :schemas] {"" {(u/get-id table) :all}})
      (perms/update-graph! [(u/get-id group) (u/get-id database) :schemas] {"" {(u/get-id table) :all}})
      ;; now fetch the perms that have been granted
      (is (= {"" {(u/get-id table) :all}}
             (get-in (perms/graph) [:groups (u/get-id group) (u/get-id database) :schemas]))))))

(deftest metabot-graph-test
  (testing (str "The data permissions graph should never return permissions for the MetaBot, because the MetaBot can "
                "only have Collection permissions")
    ;; need to swap out the perms check function because otherwise we couldn't even insert the object we want to insert
    (with-redefs [perms/assert-valid-metabot-permissions (constantly nil)]
      (mt/with-temp* [Database    [db]
                      Permissions [perms {:group_id (u/get-id (group/metabot)), :object (perms/object-path db)}]]
        (is (= false
               (contains? (:groups (perms/graph)) (u/get-id (group/metabot)))))))))

(deftest broken-out-read-query-perms-in-graph-test
  (testing "Make sure we can set the new broken-out read/query perms for a Table and the graph works as we'd expect"
    (mt/with-temp PermissionsGroup [group]
      (perms/grant-permissions! group (perms/table-read-path (Table (mt/id :venues))))
      (is (= {(mt/id :venues) {:read :all}}
             (test-data-graph group))))

    (mt/with-temp PermissionsGroup [group]
      (perms/grant-permissions! group (perms/table-segmented-query-path (Table (mt/id :venues))))
      (is (= {(mt/id :venues) {:query :segmented}}
             (test-data-graph group))))

    (mt/with-temp PermissionsGroup [group]
      (perms/update-graph! [(u/get-id group) (mt/id) :schemas]
                           {"PUBLIC"
                            {(mt/id :venues)
                             {:read :all, :query :segmented}}})
      (is (= {(mt/id :venues) {:read  :all
                                 :query :segmented}}
             (test-data-graph group))))))

(deftest root-permissions-graph-test
  (testing "A \"/\" permission grants all dataset permissions"
    (mt/with-temp Database [{db_id :id}]
      (let [{:keys [group_id]} (db/select-one 'Permissions {:object "/"})]
        (is (= {db_id {:native  :write
                       :schemas :all}}
               (-> (perms/graph)
                   (get-in [:groups group_id])
                   (select-keys [db_id]))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Granting/Revoking Permissions Helper Functions                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revoke-permissions-helper-function-test
  (testing "Make sure if you try to use the helper function to *revoke* perms for a Personal Collection, you get an Exception"
    (is (thrown? Exception
                 (perms/revoke-collection-permissions!
                  (group/all-users)
                  (u/get-id (db/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

    (testing "(should apply to descendants as well)"
      (mt/with-temp Collection [collection {:location (collection/children-location
                                                       (collection/user->personal-collection
                                                        (mt/user->id :lucky)))}]
        (is (thrown? Exception
                     (perms/revoke-collection-permissions! (group/all-users) collection)))))))

(deftest revoke-collection-permissions-test
  (testing "Should be able to revoke permissions for non-personal Collections"
    (mt/with-temp Collection [{collection-id :id}]
      (perms/revoke-collection-permissions! (group/all-users) collection-id)
      (testing "Collection should still exist"
        (is (some? (db/select-one Collection :id collection-id)))))))

(deftest disallow-granting-personal-collection-perms-test
  (mt/with-temp Collection [collection {:location (collection/children-location
                                                   (collection/user->personal-collection
                                                    (mt/user->id :lucky)))}]
    (doseq [[perms-type f] {"read"  perms/grant-collection-read-permissions!
                            "write" perms/grant-collection-readwrite-permissions!}]
      (testing (format "Should throw Exception if you use the helper function to grant %s perms for a Personal Collection"
                       perms-type)
        (is (thrown?
             Exception
             (f (group/all-users)
                (u/get-id (db/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

        (testing "(should apply to descendants as well)"
          (is (thrown?
               Exception
               (f (group/all-users) collection))))))))
