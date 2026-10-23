(ns mage.write-census
  "Count app-DB write call sites (Toucan 2 insert/update/delete/save fns) per module, and how many are gated by a
  validated record: the enclosing top-level var calls `metabase.util.validated/validated` before the write."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [hooks.common.modules :as modules]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private write-fns
  '#{insert! insert-returning-pk! insert-returning-pks! insert-returning-instance! insert-returning-instances!
     update! update-returning-pks! delete! save!})

(defn- toucan-files
  "Source files that mention toucan2. Only these can call a Toucan 2 write fn, and kondo resolves the aliases."
  []
  (:out (shell/sh* {:quiet? true} "git" "grep" "-l" "toucan2" "--"
                   "src/*.clj" "src/*.cljc" "enterprise/backend/src/*.clj" "enterprise/backend/src/*.cljc")))

(defn- var-usages!
  "Kondo `:var-usages` analysis of `paths`, from the pinned `clojure -M:kondo`."
  [paths]
  (let [{:keys [exit out err]} (apply shell/sh* {:quiet? true}
                                      "clojure" "-M:kondo" "--parallel"
                                      "--config" (pr-str {:output {:format :edn} :analysis {:var-usages true}})
                                      "--lint" paths)]
    (when-not (#{0 2 3} exit)
      (throw (ex-info (str "clj-kondo failed:\n" (str/join "\n" (take-last 20 err))) {:exit exit})))
    (get-in (edn/read-string (str/join "\n" out)) [:analysis :var-usages])))

(defn- before? [a b]
  (neg? (compare [(:row a) (:col a)] [(:row b) (:col b)])))

(defn census
  "One map per write site: `:module`, `:filename`, `:row`, `:from-var` (nil at top level), `:fn`, `:gated?`."
  [usages modules-config]
  (let [prefix->module (modules/build-prefix->module modules-config)
        validated      (group-by (juxt :filename :from-var)
                                 (filter #(and (= 'metabase.util.validated (:to %)) (= 'validated (:name %))) usages))]
    (for [{:keys [filename from from-var] :as w} usages
          :when (and (= 'toucan2.core (:to w)) (write-fns (:name w)))]
      {:module   (modules/resolve-module prefix->module from)
       :filename filename
       :row      (:row w)
       :from-var from-var
       :fn       (:name w)
       :gated?   (boolean (and from-var (some #(before? % w) (validated [filename from-var]))))})))

(defn- print-table [sites]
  (let [rows  (->> (group-by :module sites)
                   (map (fn [[module ss]]
                          (let [gated (count (filter :gated? ss))]
                            [(str module) (count ss) gated (- (count ss) gated)])))
                   (sort-by (juxt (comp - second) first)))
        total (count sites)
        gated (count (filter :gated? sites))]
    (println (format "%-40s %11s %6s %8s" "module" "write-sites" "gated" "ungated"))
    (doseq [[m n g ug] (concat rows [["TOTAL" total gated (- total gated)]])]
      (println (format "%-40s %11d %6d %8d" m n g ug)))))

(defn- print-ungated [module sites]
  (let [ss (filter #(= module (:module %)) sites)]
    (print-table ss)
    (println)
    (doseq [{:keys [filename row from-var] f :fn} (sort-by (juxt :filename :row) (remove :gated? ss))]
      (println (str filename ":" row "  " (or from-var "<top-level form>") "  t2/" f)))))

(defn cli
  "Print the census table; with `--module M`, only module M's row plus each of its ungated sites. With
  `--max-ungated N` as well, exit 1 when module M has more than N ungated sites."
  [{:keys [options]}]
  (let [modules-config (:metabase/modules (edn/read-string (slurp ".clj-kondo/config/modules/config.edn")))
        sites          (census (var-usages! (toucan-files)) modules-config)]
    (if-let [module (:module options)]
      (let [ungated (count (remove :gated? (filter #(= (symbol module) (:module %)) sites)))
            budget  (some-> (:max-ungated options) parse-long)]
        (print-ungated (symbol module) sites)
        (when (and budget (> ungated budget))
          (println (format "\n%s has %d ungated write sites, over its budget of %d. Gate the new one." module ungated budget))
          (u/exit 1)))
      (print-table sites))
    (u/exit 0)))
