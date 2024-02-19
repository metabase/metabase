(ns metabase.models.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.permissions-group
    :as perms-group
    :refer [PermissionsGroup]]
   [metabase.models.user :as user]
   [metabase.permissions.util :as perms.u]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;;; -------------------------------------------------- data-perms-path ---------------------------------------------------

(deftest ^:parallel data-perms-path-test
  (testing "valid paths"
    (are [expected args] (= expected
                            (apply perms/data-perms-path args))
      "/db/1/"                       [1]
      "/db/1/schema/public/"         [1 "public"]
      "/db/1/schema/public/table/2/" [1 "public" 2]))
  (testing "invalid paths"
    (testing "invalid input should throw an exception"
      (are [args] (thrown?
                   Exception
                   (apply perms/data-perms-path args))
        []
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
        [1 "public" []]))))

(deftest ^:parallel data-perms-path-escape-slashes-test
  (doseq [{:keys [slash-direction schema-name expected-escaped]} [{:slash-direction  "back (#8693)"
                                                                   :schema-name      "my\\schema"
                                                                   :expected-escaped "my\\\\schema"}
                                                                  {:slash-direction  "back (multiple)"
                                                                   :schema-name      "my\\\\schema"
                                                                   :expected-escaped "my\\\\\\\\schema"}
                                                                  {:slash-direction  "forward (#12450)"
                                                                   :schema-name      "my/schema"
                                                                   :expected-escaped "my\\/schema"}
                                                                  {:slash-direction  "both"
                                                                   :schema-name      "my\\/schema"
                                                                   :expected-escaped "my\\\\\\/schema"}
                                                                  {:slash-direction  "both (multiple)"
                                                                   :schema-name      "my\\\\/schema"
                                                                   :expected-escaped "my\\\\\\\\\\/schema"}]]
    (testing (format "We should handle slashes in permissions paths\nDirection = %s\nSchema = %s\n"
                     slash-direction (pr-str schema-name))
      (testing (pr-str (list 'data-perms-path {:id 1}))
        (is (= "/db/1/"
               (perms/data-perms-path {:id 1}))))
      (testing (pr-str (list 'data-perms-path {:id 1} schema-name))
        (is (= (format "/db/1/schema/%s/" expected-escaped)
               (perms/data-perms-path {:id 1} schema-name))))
      (testing (pr-str (list 'data-perms-path {:id 1} schema-name {:id 2}))
        (is (= (format "/db/1/schema/%s/table/2/" expected-escaped)
               (perms/data-perms-path {:id 1} schema-name {:id 2})))))))


;;; ---------------------------------- Generating permissions paths for Collections ----------------------------------

(deftest ^:parallel collection-path-test
  (doseq [[perms-type f-symb] {:read      'collection-read-path
                               :readwrite 'collection-readwrite-path}
          :let                [f (ns-resolve 'metabase.models.permissions f-symb)]]
    (doseq [[input expected]
            {1                                                        {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             {:id 1}                                                  {:read      "/collection/1/read/"
                                                                       :readwrite "/collection/1/"}
             collection/root-collection                               {:read      "/collection/root/read/"
                                                                       :readwrite "/collection/root/"}
             (assoc collection/root-collection :namespace "snippets") {:read      "/collection/namespace/snippets/root/read/"
                                                                       :readwrite "/collection/namespace/snippets/root/"}
             (assoc collection/root-collection :namespace "a/b")      {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}
             (assoc collection/root-collection :namespace :a/b)       {:read      "/collection/namespace/a\\/b/root/read/"
                                                                       :readwrite "/collection/namespace/a\\/b/root/"}}
            :let [expected (get expected perms-type)]]
      (testing (pr-str (list f-symb input))
        (is (= expected
               (f input)))))
    (doseq [input [{} nil "1"]]
      (testing (pr-str (list f-symb input))
        (is (thrown?
             Exception
             (f input)))))))

(deftest ^:parallel is-permissions-for-object?-test
  (are [perms-path] (perms/is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/")
    "/"
    "/db/"
    "/db/1/"
    "/db/1/schema/"
    "/db/1/schema/PUBLIC/"
    "/db/1/schema/PUBLIC/table/1/")
  (are [perms-path] (not (perms/is-permissions-for-object? perms-path "/db/1/schema/PUBLIC/table/1/"))
    "/db/2/"
    "/db/2/native/"
    "/db/1/schema/public/"
    "/db/1/schema/private/"
    "/db/1/schema/PUBLIC/table/2/"))

(deftest ^:parallel is-partial-permissions-for-object?-test
  (are [perms-path] (perms/is-partial-permissions-for-object? perms-path "/db/1/")
    "/"
    "/db/"
    "/db/1/"
    "/db/1/schema/"
    "/db/1/schema/PUBLIC/"
    "/db/1/schema/PUBLIC/table/"
    "/db/1/schema/PUBLIC/table/1/"
    "/db/1/schema/PUBLIC/table/1/field/"
    "/db/1/schema/PUBLIC/table/1/field/2/")
  (are [perms-path] (not (perms/is-partial-permissions-for-object? perms-path "/db/1/"))
    "/db/2/"
    "/db/2/native/"))

;;; This originally lived in [[metabase.models.permissions]] but it is only used in tests these days so I moved it here.
(defn is-permissions-set?
  "Is `permissions-set` a valid set of permissions object paths?"
  ^Boolean [permissions-set]
  (and (set? permissions-set)
       (every? (fn [path]
                 (or (= path "/")
                     (perms.u/valid-path? path)))
               permissions-set)))

(deftest ^:parallel is-permissions-set?-test
  (testing "valid permissions sets"
    (are [perms-set] (is-permissions-set? perms-set)
      #{}
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
      #{"/db/1/schema/public/table/2/" "/db/3/schema/public/table/4/"}))
  (testing "invalid permissions sets"
    (testing "things that aren't sets"
      (are [perms-set] (not (is-permissions-set? perms-set))
        nil {} [] true false "" 1234 :wow))
    (testing "things that contain invalid paths"
      (are [perms-set] (not (is-permissions-set? perms-set))
        #{"/" "/toucans/"}
        #{"/db/1/" "//"}
        #{"/db/1/" "/db/1/table/2/"}
        #{"/db/1/native/schema/"}
        #{"/db/1/schema/public/" "/parroty/"}
        #{"/db/1/schema/public/table/1/" "/ocean/"}))))

(deftest ^:parallel set-has-full-permissions?-test
  (are [perms path] (perms/set-has-full-permissions? perms path)
    #{"/"}                                                     "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"
    #{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"
    #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"
    #{"/db/1/native/"}                                         "/db/1/native/")
  (are [perms path] (not (perms/set-has-full-permissions? perms path))
    #{}                                              "/db/1/schema/public/table/2/"
    #{"/db/1/native/"}                               "/db/1/"
    #{"/db/1/schema/public/"}                        "/db/1/schema/"
    #{"/db/1/schema/public/table/1/"}                "/db/1/schema/public/"
    #{"/db/2/"}                                      "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"
    #{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"))

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

(deftest ^:parallel set-has-application-permission-of-type?-test
  (are [perms perms-type] (perms/set-has-application-permission-of-type? perms perms-type)
    #{"/"}                          :subscription
    #{"/"}                          :monitoring
    #{"/"}                          :setting
    #{"/application/subscription/"} :subscription
    #{"/application/monitoring/"}   :monitoring
    #{"/application/setting/"}      :setting)
  (are [perms perms-type] (not (perms/set-has-application-permission-of-type? perms perms-type))
    #{"/application/subscription/"} :monitoring
    #{"/application/subscription/"} :setting
    #{"/application/monitoring/"}   :subscription))

(deftest ^:parallel set-has-full-permissions-for-set?-test
  (are [perms paths] (perms/set-has-full-permissions-for-set? perms paths)
    #{"/"}                                                     #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"})
  (are [perms paths] (not (perms/set-has-full-permissions-for-set? perms paths))
    #{}                                                        #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/2/"}                                                #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/2/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema/public/" "/db/1/schema/public/"}           #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema//table/5/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}))

(deftest ^:parallel set-has-partial-permissions-for-set?-test
  (are [perms paths] (perms/set-has-partial-permissions-for-set? perms paths)
    #{"/"}                                                      #{"/db/1/schema/public/table/2/" "/db/2/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}    #{"/db/1/" "/db/3/"}
    #{"/db/1/schema/public/table/2/" "/db/3/"}                  #{"/db/1/"}
    #{"/db/1/schema/public/" "/db/3/schema//"}                  #{"/db/1/" "/db/3/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"}
    #{"/db/1/schema/public/"}                                   #{"/db/1/"}
    #{"/db/1/schema/"}                                          #{"/db/1/"}
    #{"/db/1/schema/public/"}                                   #{"/db/1/"}
    #{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/"}
    #{"/db/1/schema/public/"}                                   #{"/db/1/" "/db/1/schema/public/"}
    #{"/db/1/schema/public/table/1/"}                           #{"/db/1/" "/db/1/schema/public/table/1/"}
    #{"/db/1/native/"}                                          #{"/db/1/native/"}
    #{"/db/1/schema/public/"}                                   #{"/db/1/schema/"}
    #{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/"}
    #{"/db/1/schema/public/table/1/"}                           #{"/db/1/schema/public/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"}  #{"/db/1/"})
  (are [perms paths] (not (perms/set-has-partial-permissions-for-set? perms paths))
    #{}                                                        #{"/db/1/schema/public/table/2/"}
    #{"/db/1/schema/"}                                         #{"/db/1/native/"}
    #{"/db/1/native/"}                                         #{"/db/1/schema/"}
    #{"/db/2/"}                                                #{"/db/1/schema/public/table/2/"}
    #{"/db/2/" "/db/3/"}                                       #{"/db/1/schema/public/table/2/"}
    #{"/db/2/schema/public/" "/db/3/schema/public/"}           #{"/db/1/schema/public/table/2/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema/public/"}   #{"/db/1/" "/db/3/" "/db/9/"}
    #{"/db/1/schema/public/table/2/" "/db/3/"}                 #{"/db/1/" "/db/9/"}
    #{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/1/" "/db/3/" "/db/9/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}
    #{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}
    #{"/db/1/schema/"}                                         #{"/db/1/" "/db/9/"}
    #{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/9/"}
    #{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/" "/db/9/"}
    #{"/db/1/schema/public/"}                                  #{"/db/1/" "/db/1/schema/public/" "/db/9/"}
    #{"/db/1/schema/public/table/1/"}                          #{"/db/1/" "/db/1/schema/public/table/1/" "/db/9/"}
    #{"/db/1/native/"}                                         #{"/db/1/native/" "/db/9/"}
    #{"/db/1/schema/public/"}                                  #{"/db/1/schema/" "/db/9/"}
    #{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/" "/db/9/"}
    #{"/db/1/schema/public/table/1/"}                          #{"/db/1/schema/public/" "/db/9/"}
    #{"/db/1/schema/public/table/2/" "/db/3/schema//table/4/"} #{"/db/1/" "/db/9/"}))

(deftest ^:parallel set-has-any-native-query-permissions?-test
  (are [perms] (perms/set-has-any-native-query-permissions? perms)
    #{"/"}
    #{"/db/1/"}
    #{"/db/1/native/"}
    #{"/db/1/" "/db/2/schema/PUBLIC/table/1/"}
    #{"/db/1/native/" "/db/2/schema/PUBLIC/table/1/"})
  (are [perms] (not (perms/set-has-any-native-query-permissions? perms))
    #{}
    #{"/db/1"}
    #{"/db/1/native"}
    #{"/db/1/schema/"}
    #{"/db/1/schema/PUBLIC/table/1/"}))

(deftest ^:parallel perms-objects-set-for-parent-collection-test
  (are [input expected] (= expected
                           (apply perms/perms-objects-set-for-parent-collection input))
    [{:collection_id 1337} :read]  #{"/collection/1337/read/"}
    [{:collection_id 1337} :write] #{"/collection/1337/"}
    [{:collection_id nil} :read]   #{"/collection/root/read/"}
    [{:collection_id nil} :write]  #{"/collection/root/"})

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
;;; |                                 Granting/Revoking Permissions Helper Functions                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revoke-db-schema-permissions-test
  (mt/with-temp [Database database {}]
    (testing "revoke-db-schema-permissions! should revoke all non-native permissions on a database"
      (is (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                           (perms/data-perms-path database)))
      (is (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                           (perms/adhoc-native-query-path database)))
      (perms/revoke-db-schema-permissions! (perms-group/all-users) database)
      (is (not (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                                (perms/data-perms-path database))))
      (is (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                           (perms/adhoc-native-query-path database))))))

(deftest revoke-permissions-helper-function-test
  (testing "Make sure if you try to use the helper function to *revoke* perms for a Personal Collection, you get an Exception"
    (is (thrown-with-msg?
         Exception
         #"You cannot edit permissions for a Personal Collection or its descendants."
         (perms/revoke-collection-permissions!
          (perms-group/all-users)
          (u/the-id (t2/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

    (testing "(should apply to descendants as well)"
      (t2.with-temp/with-temp [Collection collection {:location (collection/children-location
                                                                 (collection/user->personal-collection
                                                                  (mt/user->id :lucky)))}]
        (is (thrown-with-msg?
             Exception
             #"You cannot edit permissions for a Personal Collection or its descendants."
             (perms/revoke-collection-permissions! (perms-group/all-users) collection)))))))

(deftest revoke-collection-permissions-test
  (testing "Should be able to revoke permissions for non-personal Collections"
    (t2.with-temp/with-temp [Collection {collection-id :id}]
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
      (testing "Collection should still exist"
        (is (some? (t2/select-one Collection :id collection-id)))))))

(deftest disallow-granting-personal-collection-perms-test
  (t2.with-temp/with-temp [Collection collection {:location (collection/children-location
                                                             (collection/user->personal-collection
                                                              (mt/user->id :lucky)))}]
    (doseq [[perms-type f] {"read"  perms/grant-collection-read-permissions!
                            "write" perms/grant-collection-readwrite-permissions!}]
      (testing (format "Should throw Exception if you use the helper function to grant %s perms for a Personal Collection"
                       perms-type)
        (is (thrown?
             Exception
             (f (perms-group/all-users)
                (u/the-id (t2/select-one Collection :personal_owner_id (mt/user->id :lucky))))))

        (testing "(should apply to descendants as well)"
          (is (thrown?
               Exception
               (f (perms-group/all-users) collection))))))))

(deftest grant-revoke-root-collection-permissions-test
  (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object Permissions {:where [:and
                                                             [:like :object "/collection/%"]
                                                             [:= :group_id group-id]]}))]
      (is (= nil
             (perms)))
      (testing "Should be able to grant Root Collection perms"
        (perms/grant-collection-read-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection read perms"
        (perms/grant-collection-read-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/read/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to revoke Root Collection perms (shouldn't affect other namespaces)"
        (perms/revoke-collection-permissions! group-id collection/root-collection)
        (is (= #{"/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/" "/collection/namespace/currency/root/"}
               (perms))))
      (testing "Should be able to revoke non-default namespace Root Collection perms (shouldn't affect default namespace)"
        (perms/revoke-collection-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/"}
               (perms)))))))

(deftest grant-revoke-application-permissions-test
  (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object Permissions
                                {:where [:and [:= :group_id group-id]
                                         [:like :object "/application/%"]]}))]
      (is (= nil (perms)))
      (doseq [[perm-type perm-path] [[:subscription "/application/subscription/"]
                                     [:monitoring "/application/monitoring/"]
                                     [:setting "/application/setting/"]]]
        (testing (format "Able to grant `%s` permission" (name perm-type))
          (perms/grant-application-permissions! group-id perm-type)
          (is (= (perms)  #{perm-path})))
        (testing (format "Able to revoke `%s` permission" (name perm-type))
          (perms/revoke-application-permissions! group-id perm-type)
          (is (not (= (perms) #{perm-path}))))))))

(deftest ^:parallel generate-graph-test
  (are [db-ids group-id->paths expected] (= expected
                                            (#'perms/generate-graph db-ids group-id->paths))
    #{2} {1 ["/db/2/"]}                            {1 {2 {:data {:native :write, :schemas :all}}}}
    #{2} {1 ["/data/db/2/"]}                       {1 {2 {:data {:native :write}}}}
    #{2} {1 ["/query/db/2/schema/"]}               {1 {2 {:query {:schemas :all, :native :none}}}}
    #{2} {1 ["/query/db/2/schema/PUBLIC/"]}        {1 {2 {:query {:schemas {"PUBLIC" :all}}}}}
    #{2} {1 ["/query/db/2/schema//"]}              {1 {2 {:query {:schemas {"" :all}}}}}
    #{2} {1 ["/db/2/schema/"]}                     {1 {2 {:data {:schemas :all}}}}
    #{2} {1 ["/query/db/2/schema/" "/data/db/2/"]} {1 {2 {:query {:schemas :all}, :data {:native :write}}}}
    #{2} {1 ["/db/2/"]}                            {1 {2 {:data {:native :write, :schemas :all}}}}))
