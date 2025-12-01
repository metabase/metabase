(ns metabase.util.custom-name
  (:require [clojure.string :as str]))

(defn validate-name [name-string]
  ;; Refatoração: Primeiro substitui espaços por _, depois valida
  (let [sanitized (str/replace name-string #" " "_")]
    (if (re-matches #"^[a-zA-Z0-9_]+$" sanitized)
      sanitized
      (throw (Exception. "Nome de tabela inválido: use apenas letras, números e underline.")))))