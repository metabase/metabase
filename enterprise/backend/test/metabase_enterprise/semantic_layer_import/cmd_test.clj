(ns metabase-enterprise.semantic-layer-import.cmd-test
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-layer-import.cmd :as cmd]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io StringWriter)))

(set! *warn-on-reflection* true)

(defn- dbt-export!
  "Run `dbt-export!` on the EDN file at `path`. What it printed to stdout and stderr, and whether it made the command
  exit 1."
  [path]
  (let [out (StringWriter.), err (StringWriter.)]
    (binding [*out* out, *err* err]
      (let [exit? (try
                    (cmd/dbt-export! path)
                    false
                    (catch ExceptionInfo e
                      (or (:cmd/exit (ex-data e)) (throw e))))]
        {:exit? exit?, :out (str out), :err (str err)}))))

(deftest dbt-export!-test
  (mt/with-temp-dir [dir nil]
    (let [manifest (io/file dir "manifest.json")
          out-dir  (str (io/file dir "out"))
          payload  {:type :dbt, :raw (str manifest), :out-dir out-dir, :config tu/default-config}
          export   (fn [payload]
                     (let [f (io/file dir "dbt.edn")]
                       (spit f (pr-str payload))
                       (dbt-export! (str f))))]
      (spit manifest (json/encode (tu/build-manifest {:measures [(tu/base-measure)]})))
      (doseq [[message bad] {":config must be a map"   (dissoc payload :config)
                             ":type must be"           (assoc payload :type :nope)
                             ":raw must be"            (assoc payload :raw "/nope.json")
                             ":out-dir must be"        (dissoc payload :out-dir)
                             ":databases must map"     (assoc-in payload [:config :databases] {})
                             ":driver must be"         (assoc-in payload [:config :driver] "postgres")
                             ":creator-email must be"  (update payload :config dissoc :creator-email)
                             "must contain a map"      [1]}]
        (testing message
          (let [{:keys [exit? err]} (export bad)]
            (is (true? exit?))
            (is (str/includes? err message)))))
      (testing "nothing is written when the payload is bad"
        (is (false? (.exists (io/file out-dir)))))
      (testing "a missing file is a usage error"
        (is (=? {:exit? true, :err #"(?s)usage: .*"} (dbt-export! "/nope.edn"))))
      (testing "the report is printed"
        (let [{:keys [exit? out]} (export payload)]
          (is (false? exit?))
          (is (=? {:out-dir out-dir, :converted [{:kind :metric}], :errors []}
                  (edn/read-string out)))
          (is (true? (.exists (io/file out-dir "collections")))))))))
