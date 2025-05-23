(ns hooks.clojure.core.ex-info-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.test :refer [deftest are testing]]
   [hooks.clojure.core.ex-info :as sut]))

(defn- warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/i18n-ex-info {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (sut/ex-info {:node (api/parse-string (pr-str form))})
    (mapv :message @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel ex-info-test-pass
  (are [form] (= []
                 (warnings (quote form)))
    (ex-info (metabase.util.i18n/deferred-tru "message"))
    (ex-info (metabase.util.i18n/tru "message"))
    (ex-info (tru "message") {})
    (ex-info (deferred-tru "message") {})))

(deftest ^:parallel ex-info-test-warns
  (are [form] (= ["ex-info message should be wrapped in tru/trs or deferred-tru/trs for i18n"]
                 (warnings (quote form)))
    (ex-info (other-fn "plain-string") {})
    (ex-info "plain-string" {})))
