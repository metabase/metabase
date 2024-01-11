(ns metabase.test.util.public-settings
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.test.util.thread-local :as tu.thread-local]))

(defn do-with-premium-features
  [features thunk]
  (let [features (set (map name features))]
    (testing (format "\nWith premium token features = %s" (pr-str features))
      ;; non-thread-local usages need to do both [[binding]] AND [[with-redefs]], because if a thread-local usage
      ;; happened already then the binding it establishes will shadow the value set by [[with-redefs]].
      ;; See [[with-premium-features-test]] below.
      (let [thunk (^:once fn* []
                          (binding [premium-features/*token-features* (constantly features)]
                            (thunk)))]
        (if tu.thread-local/*thread-local*
          (thunk)
          (with-redefs [premium-features/*token-features* (constantly features)]
            (thunk)))))))

(defmacro with-premium-features
  "Execute `body` with the allowed premium features for the Premium-Features token set to `features`. Intended for use
  testing feature-flagging.

    (with-premium-features #{:audit-app}
      ;; audit app will be enabled for body, but no other premium features
      ...)

  Normally, this will only change the premium features for the current thread, but if used
  inside [[metabase.test/test-helpers-set-global-values!]], it will affect premium features globally (i.e., it will
  use [[with-redefs]] instead of [[binding]])."
  {:style/indent 1}
  [features & body]
  `(do-with-premium-features ~features (^:once fn* [] ~@body)))

(defmacro with-additional-premium-features
  "Execute `body` with the allowed premium features for the Premium-Features token set to the union of `features` and
  the current feature set. Intended for use testing feature-flagging, if you don't want to override other features
  that are already enabled.

    (with-additional-premium-features #{:audit-app}
      ;; audit app will be enabled for body, as well as any that are already enabled
      ...)

  Normally, this will only change the premium features for the current thread, but if used
  inside [[metabase.test/test-helpers-set-global-values!]], it will affect premium features globally (i.e., it will
  use [[with-redefs]] instead of [[binding]])."
  {:style/indent 1}
  [features & body]
  `(do-with-premium-features (set/union (premium-features/*token-features*) ~features)
                             (^:once fn* [] ~@body)))
