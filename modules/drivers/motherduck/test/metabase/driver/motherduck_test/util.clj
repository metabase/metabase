(ns metabase.driver.motherduck-test.util
  "Shared token lookup for MotherDuck connection tests and test data loading."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- parse-dotenv
  "Parse KEY=VALUE lines into a map of strings, skipping blank lines and comments."
  [content]
  (into {}
        (for [line  (str/split-lines content)
              :let  [line (str/trim line)]
              :when (and (seq line)
                         (not (str/starts-with? line "#"))
                         (str/includes? line "="))
              :let  [[k v] (str/split line #"=" 2)]]
          [(str/trim k) (str/trim v)])))

(defn- dotenv
  "Read .env from the test runner's working directory, the repository root.
  Return an empty map if the file does not exist."
  []
  (let [f (io/file ".env")]
    (if (.exists f)
      (parse-dotenv (slurp f))
      {})))

(def ^:private token-vars
  "Variables that may hold the token, in order of preference. CI sets MB_MOTHERDUCK_TEST_TOKEN; MOTHERDUCK_TOKEN is
  MotherDuck's own convention, convenient locally."
  ["MB_MOTHERDUCK_TEST_TOKEN" "MOTHERDUCK_TOKEN"])

(defn motherduck-token
  "Return the MotherDuck token from the environment, falling back to .env in the repository root.
  The MotherDuck Postgres endpoint uses this token as the Postgres password."
  []
  (or (some #(not-empty (System/getenv ^String %)) token-vars)
      (let [env (dotenv)]
        (some #(not-empty (get env %)) token-vars))))
