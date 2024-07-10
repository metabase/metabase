(ns metabase.cmd.config-file-gen-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.config-file-gen :refer [create-settings-map]]))

(def example-settings '({:database-local :never,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default nil,
                         :name :admin-email,
                         :export? false,
                         :type :string,
                         :enabled? nil,
                         :encryption :maybe,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.String,
                         :on-change nil,
                         :doc nil,
                         :feature nil,
                         :namespace metabase.public-settings,
                         :munged-name "admin-email",
                         :visibility :authenticated}
                        {:database-local :allowed,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default nil,
                         :name :aggregated-query-row-limit,
                         :export? true,
                         :type :integer,
                         :enabled? nil,
                         :encryption :maybe,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.Long,
                         :on-change nil,
                         :doc
                         "Must be less than 1048575. This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.\n  This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.\n  See also MB_UNAGGREGATED_QUERY_ROW_LIMIT.",
                         :feature nil,
                         :namespace metabase.query-processor.middleware.constraints,
                         :munged-name "aggregated-query-row-limit",
                         :visibility :authenticated}
                        {:database-local :never,
                         :cache? true,
                         :user-local :never,
                         :init nil,
                         :default true,
                         :name :anon-tracking-enabled,
                         :export? false,
                         :type :boolean,
                         :enabled? nil,
                         :encryption :never,
                         :deprecated nil,
                         :audit :getter,
                         :sensitive? false,
                         :tag java.lang.Boolean,
                         :on-change nil,
                         :doc nil,
                         :feature nil,
                         :namespace metabase.public-settings,
                         :munged-name "anon-tracking-enabled",
                         :visibility :public}))

(def settings-map
  {:admin-email nil
   :aggregated-query-row-limit nil
   :anon-tracking-enabled true})

(deftest test-config-template
  (testing "Setting map for config file is formatted as expected."
    (let [settings (create-settings-map example-settings)]
      (is (= settings-map
             settings)))))
