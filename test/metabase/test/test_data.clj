(ns metabase.test.test-data
  (:require
   [clojure.java.io :as io]
   [clojure.tools.reader.edn :as edn]
   [clojure.tools.reader.reader-types]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.field :as field]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.files :as u.files]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(mr/def ::driver
  :keyword)

(mr/def ::schema.field.base-type
  ::lib.schema.common/base-type
  #_[:or
     [:map {:closed true}
      [:natives [:map-of ::driver ::lib.schema.common/non-blank-string]]]
     [:map {:closed true}
      [:native ::lib.schema.common/non-blank-string]]
     ::lib.schema.common/base-type])

(mr/def ::schema.field
  [:map {:closed true}
   [:name      ::lib.schema.common/non-blank-string]
   [:base-type ::schema.field.base-type]
   ;;
   ;; field modifiers
   ;;
   [:not-null?         {:optional true} [:maybe :boolean]] ; default is nullable
   [:unique?           {:optional true} [:maybe :boolean]] ; implied for PK fields, so doesn't need to be set there.
   [:pk?               {:optional true} [:maybe :boolean]]
   [:fk                {:optional true} [:maybe [:tuple
                                                 #_table-name ::lib.schema.common/non-blank-string
                                                 #_field-name ::lib.schema.common/non-blank-string]]]
   [:comment           {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; Should we manually create a separate/additional index for this field? This should be falsey for PK and FK fields
   ;; since they normally get an index automatically.
   [:indexed?          {:optional true} [:maybe :boolean]]
   ;;
   ;; these are only important for sync, driver implementations can ignore these columns.
   ;;
   [:semantic-type     {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:effective-type    {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:coercion-strategy {:optional true} [:maybe ms/CoercionStrategy]]
   [:visibility-type   {:optional true} [:maybe (into [:enum] field/visibility-types)]]])

(mr/def ::schema.table
  [:map {:closed true}
   [:name   ::lib.schema.common/non-blank-string]
   [:fields [:sequential ::schema.field]]
   [:comment {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::schema.database
  [:map
   [:tables [:sequential ::schema.table]]])

(mr/def ::reducible-rows
  (ms/InstanceOfClass clojure.lang.IReduceInit))

(mr/def ::artifact
  [:map
   [:filename   {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:statements {:optional true} [:maybe [:sequential some?]]]])

(mr/def ::artifacts
  [:map {:closed true}
   [:server {:optional true} [:maybe [:sequential ::artifact]]]
   [:db     {:optional true} [:maybe [:sequential ::artifact]]]])

(mu/defn ^:private reducible-edn-file :- (ms/InstanceOfClass clojure.lang.IReduceInit)
  [filename :- :string]
  (when-not (.exists (io/file filename))
    (throw (ex-info "File does not exist" {:filename filename})))
  (reify clojure.lang.IReduceInit
    (reduce [_this rf init]
      (with-open [r (clojure.tools.reader.reader-types/push-back-reader (java.io.FileReader. (io/file filename)))]
        (loop [acc init]
          (if (reduced? acc)
            (unreduced acc)
            (if-let [object (edn/read {:eof nil, :readers {'t u.date/parse}} r)]
              (recur (rf acc object))
              acc)))))))

(mu/defn ^:private read-edn-file
  [filename :- :string]
  (into [] (reducible-edn-file filename)))

(mu/defn ^:private database-schema :- ::schema.database
  []
  (first (read-edn-file "test_resources/test_data/schema.edn")))

(mu/defn ^:private table-schema :- ::schema.table
  [table-name :- :string]
  (m/find-first #(= (:name %) table-name)
                (:tables (database-schema))))

(mu/defn ^:private field-schema :- ::schema.field
  [table-name :- :string
   field-name :- :string]
  (m/find-first #(= (:name %) field-name)
                (:fields (table-schema table-name))))

(defn schema
  ([]                      (database-schema))
  ([table-name]            (table-schema table-name))
  ([table-name field-name] (field-schema table-name field-name)))

(mu/defn ^:private table-rows-filename :- :string
  [table-name :- ::lib.schema.common/non-blank-string]
  (.getAbsolutePath (io/file (format "test_resources/test_data/rows_%s.edn" (munge table-name)))))

(mu/defn ^:private reducible-table-rows :- ::reducible-rows
  [table-name :- ::lib.schema.common/non-blank-string]
  (reducible-edn-file (table-rows-filename table-name)))

(mu/defn ^:private artifact-directory :- :string
  [driver :- ::driver]
  (.getAbsolutePath (io/file (format "target/test_data/artifacts/%s" (munge (u/qualified-name driver))))))

(defmulti create-schema-artifacts-method!
  {:arglists '([driver target-directory database-schema]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(mu/defn create-schema-artifacts! :- ::artifacts
  ([driver]
   (create-schema-artifacts! driver (schema)))

  ([driver schema]
   (create-schema-artifacts! driver (artifact-directory driver) schema))

  ([driver            :- ::driver
    target-directory  :- :string
    schema            :- ::schema.database]
   (create-schema-artifacts-method! driver target-directory schema)))

(defmulti create-data-artifacts-method!
  {:arglists '([driver target-directory table-schema rows]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(mu/defn create-data-artifacts! :- ::artifacts
  ([driver table]
   (create-data-artifacts! driver (artifact-directory driver) table))

  ([driver target-directory table]
   (create-data-artifacts! driver target-directory (reducible-table-rows (:name table))))

  ([driver           :- ::driver
    target-directory :- :string
    table            :- ::schema.table
    rows             :- ::reducible-rows]
   (create-data-artifacts-method! driver target-directory table rows)))

(defn- delete-directory-if-exists! [^String target-directory]
  (let [dir-file (io/file target-directory)]
    (when (.exists dir-file)
      (FileUtils/deleteDirectory dir-file))))

(defn- create-directory! [^String target-directory]
  (u.files/create-dir-if-not-exists! (u.files/get-path target-directory)))

(mu/defn create-artifacts! :- ::artifacts
  [driver :- ::driver]
  (let [target-directory (artifact-directory driver)
        schema           (schema)]
    (delete-directory-if-exists! target-directory)
    (create-directory! target-directory)
    (reduce
     (fn [artifacts table-schema]
       (let [rows (reducible-table-rows (:name table-schema))]
         (cond-> artifacts)
         (merge-with #(vec (concat %1 %2)) artifacts (create-data-artifacts! driver target-directory table-schema rows))))
     (create-schema-artifacts! driver target-directory schema)
     (:tables schema))))

(defmulti load-artifacts-method!
  {:arglists '([driver artifacts]), :added "0.51.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(mu/defn load-artifacts!
  [driver    :- ::driver
   artifacts :- ::artifacts]
  (load-artifacts-method! driver artifacts))

(mu/defn load-test-data!
  [driver :- ::driver]
  (u/profile (format "%s for %s" `load-test-data! driver)
    (let [artifacts (u/profile (format "%s for %s" `create-artifacts! driver)
                      (create-artifacts! driver))]
      (u/profile (format "%s for %s" `load-artifacts! driver)
        (load-artifacts! driver artifacts)))))
