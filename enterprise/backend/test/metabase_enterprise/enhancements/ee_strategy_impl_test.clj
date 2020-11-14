(ns metabase-enterprise.enhancements.ee-strategy-impl-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.public-settings.metastore :as metastore]
            [pretty.core :refer [PrettyPrintable]]))

(defprotocol ^:private MyProtocol
  (m1 [this] [this x])
  (m2 [this x y]))

(deftest resolve-protocol-test
  (binding [*ns* (the-ns 'metabase-enterprise.enhancements.ee-strategy-impl-test)]
    (doseq [protocol-symb ['MyProtocol
                           `MyProtocol
                           (symbol (.getCanonicalName ^Class (:on-interface MyProtocol)))]]
      (testing (format "Protocol symbol = ^%s %s" (.getCanonicalName (class protocol-symb)) (pr-str protocol-symb))
        (is (= MyProtocol
               (#'ee-strategy-impl/resolve-protocol protocol-symb)))))))

(deftest generate-method-impl-test
  (is (= '((m1 [_]
               (metabase-enterprise.enhancements.ee-strategy-impl/invoke-ee-when-enabled
                metabase-enterprise.enhancements.ee-strategy-impl-test/m1
                ee oss))
           (m1 [_ a]
               (metabase-enterprise.enhancements.ee-strategy-impl/invoke-ee-when-enabled
                metabase-enterprise.enhancements.ee-strategy-impl-test/m1
                ee oss
                a)))
         (#'ee-strategy-impl/generate-method-impl 'ee 'oss
                                               {:var #'MyProtocol}
                                               {:name     'm1
                                                :arglists '([this] [this x])}))))

(deftest generate-protocol-impl-test
  (binding [*ns* (the-ns 'metabase-enterprise.enhancements.ee-strategy-impl-test)]
    (doseq [protocol-symb ['MyProtocol
                           `MyProtocol
                           (symbol (.getCanonicalName ^Class (:on-interface MyProtocol)))]]
      (testing (format "Protocol symbol = ^%s %s" (.getCanonicalName (class protocol-symb)) (pr-str protocol-symb))
        (is (= '(metabase_enterprise.enhancements.ee_strategy_impl_test.MyProtocol
                 (m1 [_]
                     (metabase-enterprise.enhancements.ee-strategy-impl/invoke-ee-when-enabled
                      metabase-enterprise.enhancements.ee-strategy-impl-test/m1
                      ee oss))
                 (m1 [_ a]
                     (metabase-enterprise.enhancements.ee-strategy-impl/invoke-ee-when-enabled
                      metabase-enterprise.enhancements.ee-strategy-impl-test/m1
                      ee oss
                      a))
                 (m2 [_ a b]
                     (metabase-enterprise.enhancements.ee-strategy-impl/invoke-ee-when-enabled
                      metabase-enterprise.enhancements.ee-strategy-impl-test/m2
                      ee oss
                      a b)))
               (#'ee-strategy-impl/generate-protocol-impl 'ee 'oss protocol-symb)))))))

(deftest e2e-test
  (let [ee   (reify
               PrettyPrintable
               (pretty [_] '(ee))
               MyProtocol
               (m2 [_ x y]
                 (+ x y)))
        oss  (reify
               PrettyPrintable
               (pretty [_] '(oss))
               MyProtocol
               (m2 [_ x y]
                 (- x y)))
        impl (ee-strategy-impl/reify-ee-strategy-impl ee oss MyProtocol)]
    (testing "sanity check"
      (is (= 3
             (m2 ee 1 2)))
      (is (= -1
             (m2 oss 1 2))))
    (with-redefs [metastore/enable-enhancements? (constantly false)]
      (is (= -1
             (m2 impl 1 2))))
    (with-redefs [metastore/enable-enhancements? (constantly true)]
      (is (= 3
             (m2 impl 1 2))))
    (testing "Should pretty print"
      (is (= "(metabase-enterprise.enhancements.ee-strategy-impl/reify-ee-strategy-impl (ee) (oss))"
             (pr-str impl))))))
