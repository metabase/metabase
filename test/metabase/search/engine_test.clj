(ns metabase.search.engine-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   ;; Loaded for side effects: registers the engine implementations.
   [metabase.search.init]
   [metabase.search.settings :as search.settings]
   [metabase.search.task.search-index :as task.search-index]
   [metabase.startup.core :as startup]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.util :as tu]))

(def ^:private all-engines
  #{:search.engine/semantic :search.engine/appdb :search.engine/in-place})

(defmacro ^:private with-engines
  "Run `body` with the given engine configuration, bypassing the real capability checks and settings.
  `supported` is the set of capable engines, `configured` the search-engine setting value, and `additional`
  the additional-search-engines setting value."
  [{:keys [supported configured additional]} & body]
  ;; with-redefs is required: supported-engine? is a multimethod, which with-dynamic-fn-redefs cannot proxy.
  #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
  `(with-redefs [search.engine/supported-engine?            ~supported
                 search.engine/known-engine?                all-engines
                 search.settings/configured-search-engine   (constantly ~configured)
                 search.settings/additional-search-engines  (constantly ~additional)]
     ~@body))

(deftest default-engine-resolution-test
  (testing "the first supported engine in the precedence wins"
    (with-engines {:supported all-engines}
      (is (= :search.engine/semantic (search.engine/default-engine))))
    (with-engines {:supported #{:search.engine/appdb :search.engine/in-place}}
      (is (= :search.engine/appdb (search.engine/default-engine))))
    (with-engines {:supported #{:search.engine/in-place}}
      (is (= :search.engine/in-place (search.engine/default-engine)))))
  (testing "a configured engine overrides the precedence"
    (with-engines {:supported all-engines :configured :appdb}
      (is (= :search.engine/appdb (search.engine/default-engine))))
    (with-engines {:supported all-engines :configured :in-place}
      (is (= :search.engine/in-place (search.engine/default-engine)))))
  (testing "a configured engine that is not supported falls back to the precedence"
    (with-engines {:supported #{:search.engine/appdb :search.engine/in-place} :configured :semantic}
      (is (= :search.engine/appdb (search.engine/default-engine)))))
  (testing "an unknown configured engine is ignored rather than breaking resolution"
    (with-engines {:supported all-engines :configured :elastic}
      (is (= :search.engine/semantic (search.engine/default-engine)))))
  (testing "a legacy engine name is canonicalized"
    (with-engines {:supported all-engines :configured :fulltext}
      (is (= :search.engine/appdb (search.engine/default-engine))))))

(deftest check-for-removed-env-vars-test
  (testing "the removed MB_SEMANTIC_SEARCH_ENABLED kill switch fails startup"
    (with-redefs [env/env {:mb-semantic-search-enabled "false"}]
      (testing "naming the exact fallback engine when semantic is serving search"
        (with-engines {:supported all-engines}
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Set MB_SEARCH_ENGINE=appdb to keep semantic search off"
               (search/check-for-removed-env-vars!))))
        (testing "the fallback follows precedence, not a hardcoded engine"
          (with-engines {:supported #{:search.engine/semantic :search.engine/in-place}}
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Set MB_SEARCH_ENGINE=in-place"
                 (search/check-for-removed-env-vars!)))))
        (testing "when semantic is the only supported engine there is nothing to fall back to"
          (with-engines {:supported #{:search.engine/semantic}}
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"only supported engine and cannot be disabled"
                 (search/check-for-removed-env-vars!))))))
      (testing "naming both settings when semantic is the default and also force-enabled as additional"
        (with-engines {:supported all-engines :additional ["semantic"]}
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Set MB_SEARCH_ENGINE=appdb and remove semantic from additional-search-engines"
               (search/check-for-removed-env-vars!)))))
      (testing "pointing at additional-search-engines when semantic is only force-enabled through it"
        (with-engines {:supported all-engines :configured :appdb :additional ["semantic"]}
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Remove semantic from additional-search-engines"
               (search/check-for-removed-env-vars!)))))
      (testing "startup proceeds with just a warning when another engine already serves search"
        (with-engines {:supported #{:search.engine/appdb :search.engine/in-place}}
          (is (=? [{:level   :warn
                    :message "MB_SEMANTIC_SEARCH_ENABLED is no longer supported; remove it from your configuration."}]
                  (mt/with-log-messages-for-level [messages :warn]
                    (search/check-for-removed-env-vars!)
                    (messages))))))
      (testing "the check runs as a startup validation so a throw aborts the boot"
        (is (contains? (methods startup/def-startup-validation!)
                       :metabase.search.core/check-for-removed-env-vars)))))
  (testing "startup proceeds when the kill switch is absent"
    (with-redefs [env/env {}]
      (is (nil? (search/check-for-removed-env-vars!)))))
  (testing "an empty value counts as unset, not a leftover"
    (with-redefs [env/env {:mb-semantic-search-enabled ""}]
      (is (nil? (search/check-for-removed-env-vars!))))))

(deftest search-engine-setting-test
  (testing "the setting computes the resolved engine when no value is configured"
    (with-engines {:supported #{:search.engine/appdb :search.engine/in-place}}
      (is (= :appdb (search.settings/search-engine))))
    (with-engines {:supported all-engines}
      (is (= :semantic (search.settings/search-engine)))))
  (testing "a configured value is returned as-is"
    (with-engines {:supported all-engines :configured :in-place}
      (is (= :in-place (search.settings/search-engine)))))
  (testing "an override that cannot be honored reports the engine actually serving"
    (with-engines {:supported #{:search.engine/appdb :search.engine/in-place} :configured :semantic}
      (is (= :appdb (search.settings/search-engine))))))

(deftest supported-engines-test
  (testing "the configured engine leads, followed by the precedence"
    (with-engines {:supported all-engines :configured :in-place}
      (is (= [:search.engine/in-place :search.engine/semantic :search.engine/appdb]
             (search.engine/supported-engines))))))

(deftest active-engines-test
  (testing "a semantic default activates appdb, its dependency"
    (with-engines {:supported all-engines}
      (is (= [:search.engine/semantic :search.engine/appdb] (search.engine/active-engines)))))
  (testing "an appdb default activates only appdb"
    (with-engines {:supported all-engines :configured :appdb}
      (is (= [:search.engine/appdb] (search.engine/active-engines)))))
  (testing "an in-place default activates nothing"
    (with-engines {:supported #{:search.engine/in-place}}
      (is (= [] (search.engine/active-engines)))))
  (testing "additional engines are activated alongside the default, with their dependencies"
    (with-engines {:supported all-engines :configured :appdb :additional ["semantic"]}
      (is (= [:search.engine/appdb :search.engine/semantic] (search.engine/active-engines))))
    (with-engines {:supported all-engines :configured :in-place :additional ["semantic"]}
      (is (= [:search.engine/semantic :search.engine/appdb] (search.engine/active-engines)))))
  (testing "unknown or unsupported additional engines are ignored"
    (with-engines {:supported #{:search.engine/appdb :search.engine/in-place}
                   :configured :appdb
                   :additional ["semantic" "elastic"]}
      (is (= [:search.engine/appdb] (search.engine/active-engines)))))
  (testing "legacy engine names in additional engines are canonicalized"
    (with-engines {:supported all-engines :configured :in-place :additional ["fulltext"]}
      (is (= [:search.engine/appdb] (search.engine/active-engines)))))
  (testing "additional engines tolerate csv whitespace, blanks, and qualified names"
    (with-engines {:supported all-engines :configured :appdb :additional [" semantic" "  " "search.engine/appdb"]}
      (is (= [:search.engine/appdb :search.engine/semantic] (search.engine/active-engines))))))

(deftest additional-search-engines-setter-test
  (let [triggered (atom [])]
    (mt/with-dynamic-fn-redefs [task/job-exists?             (constantly true)
                                task/trigger-now!            (fn [k] (swap! triggered conj k))
                                ;; Track the setting so the setter sees the newly added engine.
                                search.engine/active-engines (fn []
                                                               (map #(keyword "search.engine" %)
                                                                    (search.settings/additional-search-engines)))]
      (testing "activating an engine triggers the search index init task"
        (mt/with-temporary-setting-values [additional-search-engines ["semantic"]]
          ;; The setter triggers from a post-commit future.
          (is (tu/poll-until 10000 (some #{task.search-index/init-job-key} @triggered)))
          (testing "but nothing triggers when no engine is newly active"
            (reset! triggered [])
            ;; Deterministic negative: call the trigger check directly with the current engines as the baseline.
            (task.search-index/trigger-init-for-newly-active-engines! (set (search.engine/active-engines)))
            (is (empty? @triggered))))))))
