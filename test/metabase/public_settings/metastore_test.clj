(ns metabase.public-settings.metastore-test
  (:require [metabase.public-settings.metastore :as metastore]))

(defn do-with-metastore-token-features [features f]
  (with-redefs [metastore/token-features (constantly (set (map name features)))]
    (f)))

(defmacro with-metastore-token-features
  "Execute `body` with the allowed premium features for the MetaStore token set to `features`. Intended for use testing
  feature-flagging.

    (with-metastore-token-features #{:audit-app}
      ;; audit app will be enabled for body, but no other premium features
      ...)"
  {:style/indent 1}
  [features & body]
  `(do-with-metastore-token-features ~features (fn [] ~@body)))
