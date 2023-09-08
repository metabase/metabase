(ns metabase.test.util.setting
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [colorize.core :as colorize]
   [mb.hawk.parallel]
   [metabase.config.env :as config.env]
   [metabase.models :refer [Setting]]
   [metabase.models.setting :as setting]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- ->lisp-case-keyword [s]
  (-> (name s)
      (str/replace #"_" "-")
      u/lower-case-en
      keyword))

(mu/defn do-with-temp-env-var-value
  "Impl for [[with-temp-env-var-value]] macro."
  [env-var-keyword :- :keyword
   value
   thunk           :- [:=> [:cat] :any]]
  (let [value (str value)]
    (testing (colorize/blue (format "\nEnv var %s = %s\n" env-var-keyword (pr-str value)))
      (try
        ;; temporarily override the underlying environment variable value
        (binding [config.env/*env* (assoc config.env/*env* env-var-keyword value)]
          ;; flush the Setting cache so it picks up the env var value for the Setting (if applicable)
          (setting.cache/restore-cache!)
          (thunk))
        (finally
          ;; flush the cache again so the original value of any env var Settings get restored
          (setting.cache/restore-cache!))))))

(defmacro with-temp-env-var-value
  "Temporarily override the value of one or more environment variables and execute `body`. Resets the Setting cache so
  any env var Settings will see the updated value, and resets the cache again at the conclusion of `body` so the
  original values are restored.

    (with-temp-env-var-value [mb-send-email-on-first-login-from-new-device \"FALSE\"]
      ...)"
  [[env-var value & more :as bindings] & body]
  {:pre [(vector? bindings) (even? (count bindings))]}
  `(do-with-temp-env-var-value
    ~(->lisp-case-keyword env-var)
    ~value
    (fn [] ~@(if (seq more)
               [`(with-temp-env-var-value ~(vec more) ~@body)]
               body))))

(defn do-with-temp-env-var-value!
  "Impl for [[with-temp-env-var-value]] macro."
  [env-var-keyword value thunk]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-temp-env-var-value!")
  (let [value (str value)]
    (testing (colorize/blue (format "\nEnv var %s = %s\n" env-var-keyword (pr-str value)))
      (try
        ;; temporarily override the underlying environment variable value
        (with-redefs [config.env/*env* (assoc config.env/*env* env-var-keyword (str value))]
          ;; flush the Setting cache so it picks up the env var value for the Setting (if applicable)
          (setting.cache/restore-cache!)
          (thunk))
        (finally
          ;; flush the cache again so the original value of any env var Settings get restored
          (setting.cache/restore-cache!))))))

(defmacro with-temp-env-var-value!
  "Thread-unsafe version of [[with-temp-env-var-value]]."
  [[env-var value & more :as bindings] & body]
  {:pre [(vector? bindings) (even? (count bindings))]}
  `(do-with-temp-env-var-value!
    ~(->lisp-case-keyword env-var)
    ~value
    (fn [] ~@(if (seq more)
               [`(with-temp-env-var-value ~(vec more) ~@body)]
               body))))

(setting/defsetting with-temp-env-var-value-test-setting
  "Setting for the `with-temp-env-var-value-test` test."
  :visibility :internal
  :setter     :none
  :default    "abc")

(deftest ^:parallel with-temp-env-var-value-test
  (is (= "abc"
         (with-temp-env-var-value-test-setting)))
  (with-temp-env-var-value [mb-with-temp-env-var-value-test-setting "def"]
    (testing "env var value"
      (is (= "def"
             (config.env/*env* :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "def"
             (with-temp-env-var-value-test-setting)))))
  (testing "original value should be restored"
    (testing "env var value"
      (is (= nil
             (config.env/*env* :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "abc"
             (with-temp-env-var-value-test-setting)))))

  (testing "override multiple env vars"
    (with-temp-env-var-value [some-fake-env-var 123, "ANOTHER_FAKE_ENV_VAR" "def"]
      (testing "Should convert values to strings"
        (is (= "123"
               (:some-fake-env-var config.env/*env*))))
      (testing "should handle CAPITALS/SNAKE_CASE"
        (is (= "def"
               (:another-fake-env-var config.env/*env*))))))

  (testing "validation"
    (are [form] (thrown?
                 clojure.lang.Compiler$CompilerException
                 (macroexpand form))
      (list `with-temp-env-var-value '[a])
      (list `with-temp-env-var-value '[a b c]))))

(def ^:dynamic *thread-local-values*
  nil)

(defn- thread-local-value
  "Get the thread-local value from [[*thread-local-values*]] if they are being bound for
  tests (see [[metabase.test/with-temporary-setting-values]]). This value is already deserialized."
  [setting]
  (when @*thread-local-values*
    (let [value (get @*thread-local-values* (keyword (setting/setting-name setting)) ::not-found)]
      (when-not (= value ::not-found)
        ;; For backwards-compatibility with [[with-temporary-setting-values!]] treat empty strings as nil
        (cond
          (nil? value) :metabase.models.setting/nil
          (= value "") :metabase.models.setting/nil
          :else        value)))))

(defn- user-local-value-override [setting]
  (when (#'setting/allows-user-local-values? setting)
    (thread-local-value setting)))

(def ^:private setting-sources
  [#'user-local-value-override
   #'setting/user-local-value
   #'setting/database-local-value
   #'thread-local-value
   #'setting/env-var-value
   #'setting/db-or-cache-value
   #'setting/default-value])

(defn- bindings-map->setting->value [bindings-map]
  (try
    (update-keys bindings-map setting/resolve-setting)
    (catch Throwable e
      (throw (ex-info (format (str "with-temporary-setting-values: invalid settings: %s.\n"
                                   "You may need to make sure the namespace that defines the Setting is loaded.\n"
                                   "(%s)")
                              (pr-str bindings-map)
                              (ex-message e))
                      {:bindings bindings-map}
                      e)))))

(mu/defn do-with-temporary-setting-values
  "Impl for [[with-temporary-setting-values]]."
  [bindings-map :- [:map-of
                    [:fn
                     {:error/message "Setting name or definition"}
                     #(satisfies? setting/Resolvable %)]
                    any?]
   thunk        :- [:=> [:cat] any?]]
  (let [setting->value (bindings-map->setting->value bindings-map)]
    (let [setting-key->value (update-keys setting->value :name)]
      (testing (format "\nwith Setting values (current thread)\n%s\n"
                       (u/pprint-to-str setting-key->value))
        (let [thread-local-values (atom
                                   (merge (some-> *thread-local-values* deref)
                                          setting-key->value))]
          (binding [*thread-local-values*       thread-local-values
                    setting/*sources*           setting-sources
                    setting/*set-string-value!* (fn [setting-definition-or-name new-value]
                                                  (swap! thread-local-values
                                                         u/assoc-dissoc
                                                         (:name (setting/resolve-setting setting-definition-or-name))
                                                         new-value))]
            (thunk)))))))

(s/def ::with-temporary-setting-values-bindings
  (s/spec (s/* (s/cat
                :setting any?
                :value   any?))))

(defmacro with-temporary-setting-values
  "Temporarily bind the site-wide values of one or more `Settings`, execute body, and re-establish the original values.
  This works much the same way as `binding`. Thread-safe.

     (with-temporary-setting-values [google-auth-auto-create-accounts-domain \"metabase.com\"]
       (google-auth-auto-create-accounts-domain)) -> \"metabase.com\"

  To temporarily override the value of *read-only* env vars, use [[with-temp-env-var-value]]."
  {:style/indent :defn}
  [bindings & body]
  `(do-with-temporary-setting-values
    ~(into {}
           (map (fn [{:keys [setting value]}]
                  [(if ((some-fn symbol? keyword?) setting)
                     (keyword (name setting))
                     setting)
                   value]))
           (s/conform ::with-temporary-setting-values-bindings bindings))
    (^:once fn* []
     ~@body)))

(setting/defsetting test-util-setting-test-setting
  "Test setting"
  :visibility :internal)

(deftest with-temporary-setting-values-nil-test
  (testing "nil values should override non-nil ones"
    (test-util-setting-test-setting! "wow")
    (with-temporary-setting-values [test-util-setting-test-setting nil]
      (is (nil? (test-util-setting-test-setting))))))

(deftest ^:parallel with-temporary-setting-values-treat-empty-string-as-nil-test
  (testing "For backwards-compatibility with with-temporary-setting-values! treat empty strings as nil"
    (with-temporary-setting-values [test-util-setting-test-setting ""]
      (is (nil? (test-util-setting-test-setting))))))

(deftest with-temporary-setting-values-set-value-test
  (with-temporary-setting-values [test-util-setting-test-setting "A"]
    (test-util-setting-test-setting! "B")
    (is (= "B"
           (test-util-setting-test-setting)))
    (with-temporary-setting-values [test-util-setting-test-setting "C"]
      (is (= "C"
             (test-util-setting-test-setting)))
      (test-util-setting-test-setting! "D")
      (is (= "D"
             (test-util-setting-test-setting))))
    (is (= "B"
           (test-util-setting-test-setting)))))

(setting/defsetting test-util-setting-double-setting
  "Test setting"
  :visibility :internal
  :type :double)

(deftest with-temporary-setting-values-allow-ints-for-double-settings-test
  (with-temporary-setting-values [test-util-setting-double-setting 0]
    ;; not using `zero?` on purpose here because we don't want to count `0.0`
    (is (= 0
           (setting/get-value-of-type :double :test-util-setting-double-setting)))))

(deftest with-temporary-setting-values-namespaced-key-test
  (with-temporary-setting-values [::test-util-setting-double-setting 1.5]
    (is (= 1.5
           (test-util-setting-double-setting)))))

(setting/defsetting test-util-setting-user-local-setting
  "Test setting"
  :visibility :internal
  :user-local :allowed)

(setting/defsetting test-util-setting-user-local-setting-2
  "Test setting"
  :visibility :internal
  :user-local :only)

(deftest with-temporary-setting-values-set-user-local-value-test
  (binding [setting/*user-local-values* (atom (atom {:test-util-setting-user-local-setting "original"}))]
    (is (= "original"
           (test-util-setting-user-local-setting)))
    (is (nil? (test-util-setting-user-local-setting-2)))
    (with-temporary-setting-values [test-util-setting-user-local-setting "new"]
      (is (= "new"
             (test-util-setting-user-local-setting)))
      (with-temporary-setting-values [test-util-setting-user-local-setting "newer"]
        (is (= "newer"
               (test-util-setting-user-local-setting)))
        (with-temporary-setting-values [test-util-setting-user-local-setting-2 "newest"]
          (is (= "newer"
                 (test-util-setting-user-local-setting)))
          (is (= "newest"
                 (test-util-setting-user-local-setting-2))))
        (is (nil? (test-util-setting-user-local-setting-2))))
      (is (= "new"
             (test-util-setting-user-local-setting)))
      (is (nil? (test-util-setting-user-local-setting-2))))
    (is (= "original"
           (test-util-setting-user-local-setting)))
    (is (nil? (test-util-setting-user-local-setting-2)))))

(defn- upsert-raw-setting!
  [original-value setting-k value]
  (if original-value
    (t2/update! Setting setting-k {:value value})
    (t2/insert! Setting :key setting-k :value value))
  (setting.cache/restore-cache!))

(defn- restore-raw-setting!
  [original-value setting-k]
  (if original-value
    (t2/update! Setting setting-k {:value original-value})
    (t2/delete! Setting :key setting-k))
  (setting.cache/restore-cache!))

(defn do-with-temporary-setting-value!
  "Impl for [[with-temporary-setting-values!]]."
  [setting-k value thunk & {:keys [raw-setting?]}]
  ;; plugins have to be initialized because changing `report-timezone` will call driver methods
  (mb.hawk.parallel/assert-test-is-not-parallel "do-with-temporary-setting-value!")
  (initialize/initialize-if-needed! :db :plugins)
  (let [setting-k     (name setting-k)
        setting       (try
                        (#'setting/resolve-setting setting-k)
                        (catch Exception e
                          (when-not raw-setting?
                            (throw e))))]
    (if (and (not raw-setting?) (#'setting/env-var-value setting-k))
      (do-with-temp-env-var-value! (setting/setting-env-map-name setting-k) value thunk)
      (let [original-value (if raw-setting?
                             (t2/select-one-fn :value Setting :key setting-k)
                             (#'setting/get setting-k))]
        (try
          (try
            (if raw-setting?
              (upsert-raw-setting! original-value setting-k value)
              ;; bypass the feature check when setting up mock data
              (with-redefs [setting/has-feature? (constantly true)]
                (setting/set! setting-k value)))
            (catch Throwable e
              (throw (ex-info (str "Error in with-temporary-setting-values: " (ex-message e))
                              {:setting  setting-k
                               :location (symbol (name (:namespace setting)) (name setting-k))
                               :value    value}
                              e))))
          (testing (colorize/blue (format "\nSetting global value %s = %s\n" (keyword setting-k) (pr-str value)))
            (thunk))
          (finally
            (try
              (if raw-setting?
                (restore-raw-setting! original-value setting-k)
                ;; bypass the feature check when reset settings to the original value
                (with-redefs [setting/has-feature? (constantly true)]
                  (setting/set! setting-k original-value)))
              (catch Throwable e
                (throw (ex-info (str "Error restoring original Setting value: " (ex-message e))
                                {:setting        setting-k
                                 :location       (symbol (name (:namespace setting)) setting-k)
                                 :original-value original-value}
                                e))))))))))

(defmacro with-temporary-setting-values!
  "Thread-unsafe version of [[with-temporary-setting-values]].

  If an env var value is set for the setting, this will change the env var rather than the setting stored in the DB.
  To temporarily override the value of *read-only* env vars, use [[with-temp-env-var-value]]."
  [[setting-k value & more :as bindings] & body]
  (assert (even? (count bindings)) "mismatched setting/value pairs: is each setting name followed by a value?")
  (if (empty? bindings)
    `(do ~@body)
    `(do-with-temporary-setting-value! ~(keyword setting-k) ~value
       (fn []
         (with-temporary-setting-values! ~more
           ~@body)))))

(defmacro with-temporary-raw-setting-values
  "Like [[with-temporary-setting-values]] but works with raw value and it allows settings that are not defined
  using [[metabase.models.setting/defsetting]]."
  [[setting-k value & more :as bindings] & body]
  (assert (even? (count bindings)) "mismatched setting/value pairs: is each setting name followed by a value?")
  (if (empty? bindings)
    `(do ~@body)
    `(do-with-temporary-setting-value! ~(keyword setting-k) ~value
       (fn []
         (with-temporary-raw-setting-values ~more
           ~@body))
       :raw-setting? true)))

(defn do-with-discarded-setting-changes [settings thunk]
  (initialize/initialize-if-needed! :db :plugins)
  ((reduce
    (fn [thunk setting-k]
      (fn []
        (do-with-temporary-setting-value! setting-k (setting/get setting-k) thunk)))
    thunk
    settings)))

(defmacro discard-setting-changes
  "Execute `body` in a try-finally block, restoring any changes to listed `settings` to their original values at its
  conclusion.

    (discard-setting-changes [site-name]
      ...)"
  {:style/indent 1}
  [settings & body]
  `(do-with-discarded-setting-changes ~(mapv keyword settings) (fn [] ~@body)))
