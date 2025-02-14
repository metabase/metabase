(ns metabase.lib.schema.common-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [malli.error :as me]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel ip-address-test
  (testing ":type/IPAddress is both a base type and a semantic type"
    (are [schema] (not (me/humanize (mr/explain schema :type/IPAddress)))
      ::lib.schema.common/base-type
      ::lib.schema.common/semantic-type)))
