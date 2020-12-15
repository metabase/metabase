(ns metabase.util.magic-map.test-hacks
  (:require [metabase.util :as u]
            [metabase.util.magic-map.hacks :as hacks]
            [toucan.util.test :as tt]))

(println "🧙‍♂️🧙‍♂️🧙‍♂️ INSTALLING MAGIC-MAP HACKS (FOR TESTS) 🧙‍♂️🧙‍♂️🧙‍♂️")

(hacks/define-around-advice tt/do-with-temp snake-keys-attributes [model attributes f]
  (&original model (u/snake-keys attributes) f))
