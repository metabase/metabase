(ns metabase.util.custom-name-test
  (:require [clojure.test :refer :all]
            [metabase.util.custom-name :as sut]))

(deftest validate-table-name-test
  (testing "Deve aceitar um nome simples e válido"
    (is (= "minha_tabela" (sut/validate-name "minha_tabela")))))

(deftest reject-invalid-chars-test
  (testing "Deve rejeitar nomes com caracteres especiais"
    (is (thrown? Exception (sut/validate-name "tabela$inválida")))))

(deftest sanitize-spaces-test
  (testing "Deve converter espaços em underlines automaticamente"
    (is (= "tabela_com_espacos" (sut/validate-name "tabela com espacos")))))