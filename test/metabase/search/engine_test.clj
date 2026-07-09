(ns metabase.search.engine-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.engine :as search.engine]
   ;; Loaded for side effects: registers the engine implementations.
   [metabase.search.init]
   [metabase.search.settings :as search.settings]))

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
      (is (= :search.engine/semantic (search.engine/default-engine))))))

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
      (is (= [:search.engine/appdb] (search.engine/active-engines))))))
