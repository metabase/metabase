(ns metabase.mcp.db-test
  (:require
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [metabase.mcp.db :as mcp.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest ^:parallel user-id->tenant-id-refuses-non-integer-ids-test
  (testing "the ids are spliced into an `[:in …]` clause, and HoneySQL renders a non-numeric element as SQL
            rather than binding it as a parameter — so a string, a raw form or a nested query reaching this
            fn is an injection vector, not merely a type error. The guard refuses everything that is not an
            integer id, and refuses it before any SQL is built."
    (testing "a collection carrying anything but integers"
      (are [ids] (thrown-with-msg? clojure.lang.ExceptionInfo
                                   #"user ids must be a collection of integers"
                                   (mcp.db/user-id->tenant-id ids))
        ["1"]
        [:1]
        [nil]
        [1.5]
        [1M]
        ;; the shapes HoneySQL reads as syntax rather than as a value: a vector is a function call
        ;; (`[:raw …]` renders verbatim, `[:inline …]` inlines a literal), a map is a subquery, and a
        ;; keyword is an identifier. These are the injection vectors the guard exists for.
        [[:raw "1) OR 1=1 --"]]
        [[:inline "1) OR 1=1 --"]]
        [{:select [:id] :from [:core_user]}]
        ['user_id]
        ;; one bad element among good ones is still refused
        [1 2 "3"]))
    (testing "a value that is not a collection at all"
      (are [ids] (thrown-with-msg? clojure.lang.ExceptionInfo
                                   #"user ids must be a collection of integers"
                                   (mcp.db/user-id->tenant-id ids))
        1
        "1"
        nil
        :ids))
    (testing "the offending values ride ex-data rather than the message, so nothing caller-controlled
              lands in a log line"
      (is (= {:invalid ["1"]}
             (select-keys (ex-data (try (mcp.db/user-id->tenant-id [1 "1"])
                                        (catch clojure.lang.ExceptionInfo e e)))
                          [:invalid]))))))

(deftest user-id->tenant-id-test
  (testing "integer ids are accepted and resolved to their tenants"
    (let [rasta     (mt/user->id :rasta)
          crowberto (mt/user->id :crowberto)]
      (is (= {rasta nil crowberto nil}
             (mcp.db/user-id->tenant-id [rasta crowberto])))))
  (testing "an empty collection asks nothing of the database — `[:in ()]` is not valid SQL"
    (are [ids] (= {} (mcp.db/user-id->tenant-id ids))
      []
      #{})))
