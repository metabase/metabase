(ns hooks.metabase.util.i18n-test
  (:require [clj-kondo.hooks-api :as api]
            [clj-kondo.impl.utils]
            [clojure.string :as str]
            [clojure.test :refer [deftest testing is are]]
            [hooks.metabase.util.i18n]))

(defn- warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-string-or-str-args-to-i18n {:level :warning}
                                                               :metabase/validate-escaped-single-quotes-in-i18n {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.metabase.util.i18n/strict-apostrophes {:node (api/parse-string (pr-str form))})
    (mapv :message @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel strict-apostrophes-warns
  (are [form] (= ["Format string contains invalid single quote usage. Use '' for literals or '{...}' for escaping."]
                 (warnings (quote form)))
    (metabase.util.i18n/tru "this isn't good bob")
    (metabase.util.i18n/tru "'this is not good either'")
    (metabase.util.i18n/tru "''this isn't''")
    (metabase.util.i18n/tru "nope you can not escape 'like {{0}} so {{1}}'")
    (metabase.util.i18n/tru (str "it works" "when strings" "are concatenated'"))))

(deftest ^:parallel strict-apostrophes-doesnt-warn-on-good-ones
  (are [form] (= []
                 (warnings (quote form)))
    (metabase.util.i18n/tru "this isn''t bad")
    (metabase.util.i18n/tru (str "not sure why you'" "'d do this" "... but ok"))
    (metabase.util.i18n/tru "you can '{{0}}' do things like that")
    (metabase.util.i18n/tru "or '{{ this or }}}}}}}}}}' that")))
