(ns mage.clj-ts.core
  "Entry point for translating Clojure source into TypeScript-ish text."
  (:require
   [mage.clj-ts.parse :as p]
   [mage.clj-ts.rules.core]
   [mage.clj-ts.rules.malli]
   [mage.clj-ts.rules.metabase]
   [mage.clj-ts.rules.sql]
   [mage.clj-ts.rules.test]
   [mage.clj-ts.translate :as t]))

(set! *warn-on-reflection* true)

(defn translate-string
  "Translate Clojure source text into TypeScript-ish text. Returns nil if the file can't be parsed."
  [source]
  (when-let [root (try (p/parse-string source) (catch Exception _ nil))]
    (t/translate-root root)))

(defn translate-with-source-map
  "Like [[translate-string]], but returns {:text typescript-ish-text, :rows [clojure-line per output line]}, or nil."
  [source]
  (when-let [root (try (p/parse-string source) (catch Exception _ nil))]
    (t/translate-root-with-source-map root)))
