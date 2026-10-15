(ns metabase-enterprise.library-branching.format.json
  "A reader of JSON text, for the JSON text that visualization settings hold inside strings and map keys.")

(set! *warn-on-reflection* true)

(defn parse
  "The value of the JSON text `s`. Not written yet: it throws an ex-info of type ::invalid."
  [s]
  (throw (ex-info (str "Not JSON text: " (pr-str s)) {:type ::invalid :text s})))
