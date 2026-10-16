(ns metabase.measures.commands-test
  "Tests for the measures commands and the one door they go through."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.commands :as measures.commands]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.validated :as v]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- venues-definition
  "A normalized MBQL 5 definition counting venues."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- checkins-definition
  "A normalized MBQL 5 definition counting checkins: the same measure, on another table."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
        (lib/aggregate (lib/count)))))

(defn- legacy-definition
  "The same measure as legacy MBQL: what a caller that skipped the factory would be holding."
  []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :aggregation  [[:count]]}})

(defn- failed
  "The names of the checks `command` fails as itself, or `true` when it is valid as itself."
  [command]
  (let [result (v/check command {:purpose ::v/intrinsic})]
    (if (true? result)
      true
      (set (keys result)))))

;;; ------------------------------------------------- intrinsic checks ----------------------------------------------

(deftest ^:parallel create-measure-intrinsic-checks-test
  (testing "what a CreateMeasure requires of itself, over the inputs that get it wrong"
    (doseq [[label command expected]
            [["a valid command"
              (measures.commands/create-measure "Venue count" "a count" (venues-definition))
              true]
             ["an empty name"
              (measures.commands/create-measure "" nil (venues-definition))
              #{::measures.commands/name-not-blank}]
             ["a whitespace-only name"
              (measures.commands/create-measure "   " nil (venues-definition))
              #{::measures.commands/name-not-blank}]
             ["no name at all"
              (measures.commands/create-measure nil nil (venues-definition))
              #{::measures.commands/name-not-blank}]
             ["no definition -- the factory normalizes it to the empty query, which names no table"
              (measures.commands/create-measure "Venue count" nil nil)
              #{::measures.commands/definition-names-a-table}]
             ["an empty definition"
              (measures.commands/create-measure "Venue count" nil {})
              #{::measures.commands/definition-names-a-table}]
             ["a definition with no source table"
              (measures.commands/create-measure "Venue count" nil {:lib/type :mbql/query
                                                                   :database (mt/id)
                                                                   :stages   [{:lib/type :mbql.stage/mbql}]})
              #{::measures.commands/definition-names-a-table}]
             ["a hand-built record holding legacy MBQL -- the table check waits on normalization, so it is not asked"
              (measures.commands/->CreateMeasure "Venue count" nil (legacy-definition))
              #{::measures.commands/definition-normalized}]
             ["a hand-built record holding something that is no query at all"
              (measures.commands/->CreateMeasure "Venue count" nil "not a query")
              #{::measures.commands/definition-normalized}]
             ["two things wrong at once, both reported"
              (measures.commands/create-measure "" nil {})
              #{::measures.commands/name-not-blank ::measures.commands/definition-names-a-table}]]]
      (testing label
        (is (= expected (failed command)))))))

(deftest ^:parallel update-measure-intrinsic-checks-test
  (testing "what an UpdateMeasure requires of itself, over the inputs that get it wrong"
    (doseq [[label command expected]
            [["a valid command"
              (measures.commands/update-measure 1 {:name "Venue count"} "renamed it")
              true]
             ["every updatable key at once, including a description cleared to nil"
              (measures.commands/update-measure 1 {:name        "Venue count"
                                                   :description nil
                                                   :archived    false
                                                   :definition  (venues-definition)}
                                                "changed everything")
              true]
             ["no id"
              (measures.commands/update-measure nil {:name "Venue count"} "renamed it")
              #{::measures.commands/id}]
             ["an id that is not a measure id"
              (measures.commands/update-measure 0 {:name "Venue count"} "renamed it")
              #{::measures.commands/id}]
             ["nothing to change"
              (measures.commands/update-measure 1 {} "renamed it")
              #{::measures.commands/changes-non-empty}]
             ["a name blanked out -- the same rule, under the same name, as on a create"
              (measures.commands/update-measure 1 {:name "   "} "renamed it")
              #{::measures.commands/name-not-blank}]
             ["a name set to nil by hand"
              (measures.commands/->UpdateMeasure 1 {:name nil} "renamed it")
              #{::measures.commands/name-not-blank}]
             ["a key an update may not change"
              (measures.commands/update-measure 1 {:creator_id 2} "took it over")
              #{::measures.commands/changes-keys}]
             ["no revision message"
              (measures.commands/update-measure 1 {:name "Venue count"} nil)
              #{::measures.commands/revision-message-not-blank}]
             ["an empty revision message"
              (measures.commands/update-measure 1 {:name "Venue count"} "")
              #{::measures.commands/revision-message-not-blank}]
             ["a whitespace-only revision message"
              (measures.commands/update-measure 1 {:name "Venue count"} "  ")
              #{::measures.commands/revision-message-not-blank}]
             ["a changed definition with no source table"
              (measures.commands/update-measure 1 {:definition {}} "emptied it")
              #{::measures.commands/definition-names-a-table}]
             ["a definition cleared to nil -- present-but-nil is a change, and not one a measure survives"
              (measures.commands/update-measure 1 {:definition nil} "cleared it")
              #{::measures.commands/definition-normalized}]
             ["a hand-built record holding legacy MBQL"
              (measures.commands/->UpdateMeasure 1 {:definition (legacy-definition)} "changed it")
              #{::measures.commands/definition-normalized}]
             ["a blank revision message and an unchanged-key violation, both reported"
              (measures.commands/update-measure 1 {:creator_id 2} " ")
              #{::measures.commands/changes-keys ::measures.commands/revision-message-not-blank}]]]
      (testing label
        (is (= expected (failed command)))))))

(deftest ^:parallel every-failure-teaches-test
  (testing "every failure carries the :doc that is the rule in words, which is what MCP renders as its error"
    (doseq [command [(measures.commands/create-measure "" nil {})
                     (measures.commands/update-measure nil {} nil)]]
      (doseq [[nm failure] (v/check command {:purpose ::v/intrinsic})]
        (testing nm
          (is (string? (:doc failure)))
          (is (not (str/blank? (:doc failure)))))))))

;;; ---------------------------------------------------- the door ---------------------------------------------------

(deftest wrong-purpose-is-refused-test
  (testing "a context built for one purpose cannot drive a command that performs another"
    (let [creating (measures.commands/request-context ::measures.commands/creating)
          updating (measures.commands/request-context ::measures.commands/updating)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Not a context for creating"
           (measures.commands/mutate! updating (measures.commands/create-measure "m" nil {}))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Not a context for updating"
           (measures.commands/mutate! creating (measures.commands/update-measure 1 {:name "m"} "why"))))
      (testing "and neither does a context naming no purpose at all"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Not a context for creating"
             (measures.commands/mutate! (assoc creating :purpose nil)
                                        (measures.commands/create-measure "m" nil {}))))))))

;;; ------------------------------------------------ permission checks ----------------------------------------------

(defn- mutate-failures!
  "The failure report `mutate!` throws for `command` in a fresh context for the purpose it performs, as a map of
  check name to its failure, or nil when the write went through."
  [command]
  (try
    (measures.commands/mutate! (measures.commands/request-context
                                (measures.commands/command-purpose command))
                               command)
    nil
    (catch clojure.lang.ExceptionInfo e
      (merge (select-keys (ex-data e) [:status-code]) {:failures (:failures (ex-data e))}))))

(deftest creating-asks-the-definitions-table-test
  (testing "creating a measure asks whether the caller may create one on the table its definition names"
    (mt/with-model-cleanup [:model/Measure]
      (let [command (measures.commands/create-measure "commands-test venue count" nil (venues-definition))]
        (testing "a plain user is refused, with the 403 the check declared"
          (mt/with-current-user (mt/user->id :rasta)
            (is (=? {:status-code 403
                     :failures    {::measures.commands/may-create-on-table {:contextual true}}}
                    (mutate-failures! command)))))
        (testing "and an admin is not"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (nil? (mutate-failures! command)))))))))

(deftest updating-asks-the-stored-measures-table-test
  (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                  :definition (venues-definition)}]
    (let [command (measures.commands/update-measure measure-id {:name "commands-test renamed"} "renamed it")]
      (testing "a plain user may not edit a measure on a table they cannot author on"
        (mt/with-current-user (mt/user->id :rasta)
          (is (=? {:status-code 403
                   :failures    {::measures.commands/may-write {:contextual true}}}
                  (mutate-failures! command)))))
      (testing "an admin may"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (nil? (mutate-failures! command)))
          (is (= "commands-test renamed" (t2/select-one-fn :name :model/Measure :id measure-id))))))))

(deftest updating-a-measure-that-is-not-there-test
  (testing "a measure that does not exist is a 404, and the permission check it gates is not even asked"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (mutate-failures! (measures.commands/update-measure Integer/MAX_VALUE
                                                                      {:name "commands-test ghost"}
                                                                      "renamed it"))]
        (is (=? {:status-code 404
                 :failures    {::measures.commands/measure-exists {:contextual true}}}
                result))
        (testing "and it says which checks it stopped from running"
          (is (= #{::measures.commands/may-write ::measures.commands/may-create-on-new-table}
                 (set (get-in result [:failures ::measures.commands/measure-exists :blocked])))))))))

(deftest a-definition-that-moves-the-measure-asks-about-the-new-table-test
  (testing "an admin may move a measure to another table"
    (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                    :definition (venues-definition)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (nil? (mutate-failures! (measures.commands/update-measure
                                    measure-id
                                    {:definition (checkins-definition)}
                                    "moved it to checkins"))))
        (is (= (mt/id :checkins) (t2/select-one-fn :table_id :model/Measure :id measure-id)))))))

;; not ^:parallel: rewrites global data perms. EE-only: a data analyst can only author with `advanced-permissions`
(mt/when-ee-evailable
 (deftest may-create-on-new-table-fires-on-a-move-test
   (testing "an update whose definition moves the measure to a table the caller cannot author on is refused -- the
             write check covered the old table, and only this check covers the new one"
     (mt/with-premium-features #{:advanced-permissions}
       (mt/with-no-data-perms-for-all-users!
         (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                        :model/User {analyst-id :id} {:is_data_analyst true}]
           (perms/add-user-to-group! analyst-id group-id)
           (perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
           (perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
           (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                           :creator_id analyst-id
                                                           :definition (venues-definition)}]
             (mt/with-current-user analyst-id
               (testing "renaming in place is fine"
                 (is (nil? (mutate-failures! (measures.commands/update-measure
                                             measure-id {:name "commands-test analyst rename"} "renamed it")))))
               (testing "moving it to checkins is not"
                 (is (=? {:status-code 403
                          :failures    {::measures.commands/may-create-on-new-table {:contextual true}}}
                         (mutate-failures! (measures.commands/update-measure
                                           measure-id {:definition (checkins-definition)} "moved it")))))
               (testing "and the refusal actually prevented the move"
                 (is (= (mt/id :venues)
                        (t2/select-one-fn :table_id :model/Measure :id measure-id))))))))))))
