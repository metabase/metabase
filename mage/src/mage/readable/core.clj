(ns mage.readable.core
  "Entry point for translating Clojure source into readable TypeScript-ish text."
  (:require
   [mage.readable.parse :as p]
   [mage.readable.rules.core]
   [mage.readable.rules.malli]
   [mage.readable.rules.metabase]
   [mage.readable.rules.sql]
   [mage.readable.rules.test]
   [mage.readable.translate :as t]))

(set! *warn-on-reflection* true)

(defn translate-string
  "Translate Clojure source text into readable text. Returns nil if the file can't be parsed."
  [source]
  (when-let [root (try (p/parse-string source) (catch Exception _ nil))]
    (t/translate-root root)))

(defn translate-with-source-map
  "Like [[translate-string]], but returns {:text readable-text, :rows [clojure-line per output line]}, or nil."
  [source]
  (when-let [root (try (p/parse-string source) (catch Exception _ nil))]
    (t/translate-root-with-source-map root)))
