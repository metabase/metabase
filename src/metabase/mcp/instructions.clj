(ns metabase.mcp.instructions
  "Tier 1 of the guidance layer: the server `instructions` every client is handed on connect.

   The budget is 2KB, and the first ~500 characters have to stand alone, because that is all some
   clients inject. So this tier answers only what the tools cannot answer for themselves — what the
   server is for, the canonical workflow, the read/write split, and which skill to load before a
   multi-step job. Reference material belongs in a skill (tier 2); how to call one tool belongs in its
   description (tier 2's sibling)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def max-bytes
  "The tier-1 budget. Instructions ride in every connection's prompt prefix, so they are paid for on
   every request; `metabase.mcp.instructions-test` holds them under this cap."
  2048)

(def ^:private instructions-path "mcp/instructions.md")

(def ^:private instructions-text
  (delay (-> instructions-path io/resource (slurp :encoding "UTF-8") str/trim)))

(defn instructions
  "The server `instructions` string, returned from `server/discover` and `initialize`."
  []
  @instructions-text)
