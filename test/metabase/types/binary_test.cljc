(ns metabase.types.binary-test
  (:require
   [clojure.test :refer :all]
   [metabase.types.core :as types]))

(deftest binary-type-hierarchy-test
  (testing "Binary type hierarchy"
    (testing ":type/Binary is a base type"
      (is (isa? :type/Binary :type/*)))
    
    (testing ":type/Binary has field-values-unsupported"
      (is (isa? :type/Binary :type/field-values-unsupported)))
    
    (testing "Database-specific binary types inherit from :type/Binary"
      (is (isa? :type/MySQLBlob :type/Binary))
      (is (isa? :type/PostgresBytea :type/Binary))
      (is (isa? :type/OracleBlob :type/Binary)))
    
    (testing "Large binary types have :type/Large"
      (is (isa? :type/MySQLBlob :type/Large))
      (is (isa? :type/OracleBlob :type/Large)))
    
    (testing "Binary ID types"
      (is (isa? :type/BinaryID :type/Binary))
      (is (isa? :type/BinaryID :Semantic/*)))
    
    (testing "Hash types"
      (is (isa? :type/Hash :type/Binary))
      (is (isa? :type/Hash :Semantic/*))
      (is (isa? :type/SHA256 :type/Hash))
      (is (isa? :type/MD5 :type/Hash)))))

(deftest binary-coercion-strategies-test
  (testing "Binary coercion strategies"
    (testing "Binary to string coercions"
      (is (isa? :Coercion/Binary->String :Coercion/*))
      (is (isa? :Coercion/Binary->Base64String :Coercion/Binary->String))
      (is (isa? :Coercion/Binary->HexString :Coercion/Binary->String)))))

(deftest field-is-type-binary-test
  (testing "field-is-type? works with binary types"
    (let [binary-field {:base_type :type/Binary}
          postgres-field {:base_type :type/PostgresBytea}
          hash-field {:base_type :type/Binary :effective_type :type/SHA256}]
      
      (is (types/field-is-type? :type/Binary binary-field))
      (is (types/field-is-type? :type/Binary postgres-field))
      (is (types/field-is-type? :type/Binary hash-field))
      (is (types/field-is-type? :type/Hash hash-field)))))