(ns mage.codespell
  (:require
   [clojure.string :as str]
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(def ^:private codespell-dirs
  "Keep these in sync with the list of directories in `.github/workflows/codespell.yml`."
  ["docs"
   #_"e2e"
   "enterprise"
   "frontend"
   "modules/drivers"
   "src"
   #_"test"])

(defn codespell [_cli-args]
  (let [{:keys [exit], :or {exit -1}} (apply shell/sh*
                                             "codespell"
                                             codespell-dirs)]
    (System/exit exit)))

(defn codespell-interactive [_cli-args]
  (let [command (list*
                 "codespell"
                 ;; ask for confirmation, and allow user to choose fix when more than one
                 ;; is available
                 "--interactive" 3
                 codespell-dirs)]
    (println "Interactive command support for MAGE doesn't seem to work yet, so please run this by doing")
    (println)
    (apply println command)
    (System/exit 0)))

;; evaluate this to regenerate the list in `.codespellrc`
(comment
  (def ^:private ignored-files
    "List of files/directories to exempt from CodeSpell linting."
    (str/join "," ["*.csv"
                   "*.edn"
                   "*.geojson"
                   "*.json"
                   "*.tsv"
                   "*.xml"
                   "docs/developers-guide/drivers/driver-tests.md"
                   "docs/developers-guide/e2e-tests.md"
                   "docs/questions/query-builder/expressions-list.md"
                   "docs/questions/visualizations/country-codes.md"
                   "e2e/test/scenarios/admin/i18n/content-translation/constants.ts"
                   "frontend/src/cljs"
                   "frontend/src/metabase/querying/expressions/tokenizer/lezer.js"
                   "frontend/src/metabase/static-viz/constants/char-sizes.ts"
                   "frontend/src/metabase/visualizations/lib/mapping_codes.ts"
                   "modules/drivers/mongo/src/metabase/driver/mongo/operators.clj"])))
