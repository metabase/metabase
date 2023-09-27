(ns metabase.test.util.setting
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [colorize.core :as colorize]
   [environ.core :as env]
   [mb.hawk.parallel]
   [metabase.models :refer [Setting]]
   [metabase.models.setting :as setting]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.test.initialize :as initialize]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn do-with-temp-env-var-value
  "Impl for [[with-temp-env-var-value]] macro."
  [env-var-keyword value thunk]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-temp-env-var-value")
  (let [value (str value)]
    (testing (colorize/blue (format "\nEnv var %s = %s\n" env-var-keyword (pr-str value)))
      (try
        ;; temporarily override the underlying environment variable value
        (with-redefs [env/env (assoc env/env env-var-keyword value)]
          ;; flush the Setting cache so it picks up the env var value for the Setting (if applicable)
          (setting.cache/restore-cache!)
          (thunk))
        (finally
          ;; flush the cache again so the original value of any env var Settings get restored
          (setting.cache/restore-cache!))))))

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

(defn do-with-temporary-global-setting-value
  [setting-k value thunk & {:keys [raw-setting?]}]
  ;; plugins have to be initialized because changing `report-timezone` will call driver methods
  (mb.hawk.parallel/assert-test-is-not-parallel "do-with-temporary-setting-value + test-helpers-set-global-values!")
  (initialize/initialize-if-needed! :db :plugins)
  (let [setting-k     (name setting-k)
        setting       (try
                        (#'setting/resolve-setting setting-k)
                        (catch Exception e
                          (when-not raw-setting?
                            (throw e))))]
    (if (and (not raw-setting?) (#'setting/env-var-value setting-k))
      (do-with-temp-env-var-value (setting/setting-env-map-name setting-k) value thunk)
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
          (testing (colorize/blue (format "\nSetting %s = %s\n" (keyword setting-k) (pr-str value)))
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

(defn- do-with-temporary-global-setting-values
  [bindings-map thunk]
  ((reduce
    (fn [thunk [k v]]
      (^:once fn* [] (do-with-temporary-global-setting-value k v thunk)))
    thunk
    bindings-map)))

(defn- do-with-temporary-thread-local-setting-values
  [bindings-map thunk]
  (let [bindings-map (update-vals bindings-map
                                  (fn [v]
                                    (when-not (and (string? v)
                                                   (str/blank? v))
                                      v)))]
    ;; make sure all of the Settings exist, or throw an Exception. Be nice and catch typos
    (doseq [[k _v] bindings-map]
      (setting/resolve-setting k))
    (testing (format "\nwith temporary setting values\n%s\n" (u/pprint-to-str bindings-map))
      (binding [setting/*thread-local-values* (atom (merge (some-> setting/*thread-local-values* deref)
                                                           bindings-map))]
        (thunk)))))

(mu/defn do-with-temporary-setting-values
  "Impl for [[with-temporary-setting-values]]."
  [bindings-map :- [:map-of
                    [:fn
                     {:error/message "Setting name or definition"}
                     #(satisfies? setting/Resolvable %)]
                    any?]
   thunk        :- [:and fn? [:=> [:cat] any?]]]
  (let [f (if tu.thread-local/*thread-local*
            do-with-temporary-thread-local-setting-values
            do-with-temporary-global-setting-values)]
    (f bindings-map thunk)))

(defn do-with-discarded-setting-changes [settings thunk]
  (initialize/initialize-if-needed! :db :plugins)
  ((reduce
    (fn [thunk setting-k]
      (^:once fn* [] (do-with-temporary-global-setting-value setting-k (setting/get setting-k) thunk)))
    thunk
    settings)))
