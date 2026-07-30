(ns dev.edn-driver.file
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [malli.error :as me]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [medley.core :as m]))

(set! *warn-on-reflection* true)

;; files are of the shape:

(mr/def ::table.name
  ::lib.schema.common/non-blank-string)

(mr/def ::column
  [:map
   [:field-name      ::lib.schema.common/non-blank-string]
   [:base-type       ::lib.schema.common/base-type]
   [:visibility-type {:optional true} ::lib.schema.metadata/column.visibility-type]
   [:not-null?       {:optional true} :boolean]
   [:fk              {:optional true} :keyword]])

(mr/def ::table.columns
  [:sequential ::column])

;; TODO -- table.row has to have the same number of values as cols in `::table.columns`.
(mr/def ::table.row
  [:sequential any?])

(mr/def ::table
  [:tuple
   ::table.name
   ::table.columns
   [:sequential ::table.row]])

(mr/def ::file
  "A file is just a sequence of tables."
  [:sequential ::table])

(mu/defn read-file :- [:maybe ::file]
  [file]
  (when-let [file (some-> file io/file)]
    (when-not (.exists file)
      (throw (Exception. "FILE DOESN'T EXIST!!!!!!")))
    (when (.exists file)
      (with-open [is (java.io.FileInputStream. file)
                  r  (java.io.PushbackReader. (java.io.InputStreamReader. is))]
        (let [data (edn/read {:readers *data-readers*} r)]
          (when-let [error (some->> data (mr/explain ::file) me/humanize)]
            (throw (ex-info "Invalid data!" {:error error})))
          data)))))

(mu/defn table-name :- :string
  [table :- ::table]
  (first table))

(mu/defn table-columns :- ::table.columns
  [table :- ::table]
  (second table))

(mu/defn table-rows :- [:sequential ::table.row]
  [table :- ::table]
  (last table))

(mu/defn table-with-name :- ::table
  [file         :- ::file
   a-table-name :- ::table.name]
  (m/find-first
   #(= (table-name %) a-table-name)
   file))
