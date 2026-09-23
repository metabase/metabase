(ns mage.cljts.core
  "Entry point for translating Clojure source into TypeScript-ish text."
  (:require
   [mage.cljts.parse :as p]
   [mage.cljts.rules.core]
   [mage.cljts.rules.malli]
   [mage.cljts.rules.metabase]
   [mage.cljts.rules.sql]
   [mage.cljts.rules.test]
   [mage.cljts.translate :as t]))

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
