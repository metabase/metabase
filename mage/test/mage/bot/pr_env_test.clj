(ns mage.bot.pr-env-test
  (:require
   [babashka.fs :as fs]
   [clojure.test :refer [deftest is testing]]
   [mage.bot.pr-env :as pr-env]))

(set! *warn-on-reflection* true)

(def ^:private write-env-file! #'pr-env/write-env-file!)
(def ^:private read-env-file   #'pr-env/read-env-file)

(defn- with-temp-cwd
  "Re-bind user.dir so .bot/ files land in a temp dir, then clean up."
  [f]
  (let [orig (System/getProperty "user.dir")
        dir  (str (fs/create-temp-dir))]
    (try
      (System/setProperty "user.dir" dir)
      (f dir)
      (finally
        (System/setProperty "user.dir" orig)
        (fs/delete-tree dir)))))

(deftest write-and-read-env-file-roundtrip
  (with-temp-cwd
    (fn [_]
      (write-env-file! {:base-url  "https://pr1234.coredev.metabase.com"
                        :pr-num    "1234"
                        :repl-host "10.0.0.1"
                        :username  "bot@example.com"
                        :password  "p@ss w/ space"})
      (let [m (read-env-file)]
        (is (= "https://pr1234.coredev.metabase.com" (get m "BASE_URL")))
        (is (= "1234" (get m "PR_NUM")))
        (is (= "10.0.0.1" (get m "REPL_HOST")))
        (is (= "1234" (get m "REPL_PORT")))
        (is (= "bot@example.com" (get m "USERNAME")))
        (is (= "p@ss w/ space" (get m "PASSWORD")))))))

(deftest pr-env-active?-test
  (testing "false when .bot/pr-env.env is absent"
    (with-temp-cwd
      (fn [_] (is (false? (pr-env/pr-env-active?))))))
  (testing "true after write"
    (with-temp-cwd
      (fn [_]
        (write-env-file! {:base-url "https://x" :pr-num "1"
                          :repl-host "h" :username "u" :password "p"})
        (is (true? (pr-env/pr-env-active?)))))))

(deftest setup!-rejects-missing-args
  (testing "missing --url → exits non-zero"
    (let [ex (try
               (pr-env/setup! {:options {:url nil :pr "123"}})
               nil
               (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex))
      (is (= 1 (get (ex-data ex) :babashka/exit)))))
  (testing "missing --pr → exits non-zero"
    (let [ex (try
               (pr-env/setup! {:options {:url "https://x" :pr ""}})
               nil
               (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex))
      (is (= 1 (get (ex-data ex) :babashka/exit)))))
  (testing "blank --url and --pr → exits non-zero"
    (let [ex (try
               (pr-env/setup! {:options {:url "" :pr ""}})
               nil
               (catch clojure.lang.ExceptionInfo e e))]
      (is (some? ex))
      (is (= 1 (get (ex-data ex) :babashka/exit))))))
