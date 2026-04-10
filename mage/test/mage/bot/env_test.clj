(ns mage.bot.env-test
  (:require
   [babashka.fs :as fs]
   [clojure.test :refer [deftest is testing]]
   [mage.nvoxland.env :as bot-env]))

(set! *warn-on-reflection* true)

(defn- with-temp-dir
  "Create a temp directory, call f with its path, then clean up."
  [f]
  (let [dir (str (fs/create-temp-dir))]
    (try (f dir)
         (finally (fs/delete-tree dir)))))

(deftest read-mise-local-toml-test
  (with-temp-dir
    (fn [dir]
      (spit (str dir "/mise.local.toml")
            (str "# Auto-generated\n"
                 "[env]\n"
                 "MB_JETTY_PORT = \"3042\"\n"
                 "NREPL_PORT = \"50647\"\n"
                 "# A comment\n"
                 "\n"))
      (let [result (bot-env/read-mise-local-toml dir)]
        (is (= "3042" (get result "MB_JETTY_PORT")))
        (is (= "50647" (get result "NREPL_PORT")))))))

(deftest read-mise-local-toml-missing-file
  (with-temp-dir
    (fn [dir]
      (is (nil? (bot-env/read-mise-local-toml dir))))))

(deftest read-dot-env-test
  (with-temp-dir
    (fn [dir]
      (spit (str dir "/.env")
            (str "# Comment\n"
                 "SIMPLE=value\n"
                 "export EXPORTED=val2\n"
                 "QUOTED=\"with spaces\"\n"
                 "SINGLE='single quoted'\n"
                 "\n"))
      (let [result (bot-env/read-dot-env dir)]
        (is (= "value" (get result "SIMPLE")))
        (is (= "val2" (get result "EXPORTED")))
        (is (= "with spaces" (get result "QUOTED")))
        (is (= "single quoted" (get result "SINGLE")))))))

(deftest read-lein-env-test
  (with-temp-dir
    (fn [dir]
      (spit (str dir "/.lein-env")
            (pr-str {:some-key "val1"
                     :another-thing "val2"}))
      (let [result (bot-env/read-lein-env dir)]
        (is (= "val1" (get result "SOME_KEY")))
        (is (= "val2" (get result "ANOTHER_THING")))))))

(deftest resolve-env-priority-test
  (testing "mise.local.toml wins over .env"
    (with-temp-dir
      (fn [dir]
        (spit (str dir "/mise.local.toml") "MB_JETTY_PORT = \"3042\"\n")
        (spit (str dir "/.env") "MB_JETTY_PORT=9999\n")
        (is (= "3042" (bot-env/resolve-env "MB_JETTY_PORT" dir))))))
  (testing ".env wins over .lein-env"
    (with-temp-dir
      (fn [dir]
        (spit (str dir "/.env") "MY_VAR=from-env\n")
        (spit (str dir "/.lein-env") (pr-str {:my-var "from-lein"}))
        (is (= "from-env" (bot-env/resolve-env "MY_VAR" dir))))))
  (testing "returns nil when not found anywhere"
    (with-temp-dir
      (fn [dir]
        (is (nil? (bot-env/resolve-env "NONEXISTENT_VAR_12345" dir)))))))
