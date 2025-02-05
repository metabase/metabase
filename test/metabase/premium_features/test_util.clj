(ns metabase.premium-features.test-util
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test.util.thread-local :as tu.thread-local]))

;;; This is actually thread-safe by default unless you're using [[metabase.test/test-helpers-set-global-values!]]
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn do-with-premium-features
  "Implementation of `with-premium-features"
  [features thunk]
  (let [features (set (map name features))]
    (testing (format "\nWith premium token features = %s" (pr-str features))
             ;; non-thread-local usages need to do both [[binding]] AND [[with-redefs]], because if a thread-local usage
             ;; happened already then the binding it establishes will shadow the value set by [[with-redefs]].
             ;; See [[with-premium-features-test]] below.
      (let [thunk (^:once fn* []
                    (binding [token-check/*token-features* (constantly features)]
                      (thunk)))]
        (if tu.thread-local/*thread-local*
          (thunk)
          (with-redefs [token-check/*token-features* (constantly features)]
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
  `(do-with-premium-features
    (set/union (token-check/*token-features*) ~features)
    (^:once fn* [] ~@body)))

(defn assert-has-premium-feature-error
  [feature-name request]
  (is
   (partial=
    {:cause   (str feature-name " is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"),
     :data    {:status      "error-premium-feature-not-available",
               :status-code 402},
     :message (str feature-name " is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"),
     :status  "error-premium-feature-not-available"}
    request)))
