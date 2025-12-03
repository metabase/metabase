(ns metabase.app-db.aws-iam-test
  "Integration tests for AWS IAM authentication with application database.

  These tests require actual AWS RDS instances configured for IAM authentication.
  Tests will be skipped if required environment variables are not set.

  Required environment variables:
  - Postgres:
    - MB_POSTGRES_AWS_IAM_TEST_HOST
    - MB_POSTGRES_AWS_IAM_TEST_PORT
    - MB_POSTGRES_AWS_IAM_TEST_USER
    - MB_POSTGRES_AWS_IAM_TEST_DBNAME
  - MySQL:
    - MB_MYSQL_AWS_IAM_TEST_HOST
    - MB_MYSQL_AWS_IAM_TEST_PORT
    - MB_MYSQL_AWS_IAM_TEST_USER
    - MB_MYSQL_AWS_IAM_TEST_DBNAME
    - MB_MYSQL_AWS_IAM_TEST_SSL_CERT (required, PEM certificate content/trust)"
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.config.core :as config]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- get-connection-and-close!
  "Attempt to get a connection from the DataSource and close it immediately.
  Returns true if successful, throws if connection fails."
  [^javax.sql.DataSource datasource]
  (with-open [conn (.getConnection datasource)]
    (assert conn "Connection should not be nil")
    true))

(deftest ^:mb/once postgres-aws-iam-test
  (if (config/config-bool :mb-postgres-aws-iam-test)
    (let [host   (config/config-str :mb-postgres-aws-iam-test-host)
          port   (config/config-int :mb-postgres-aws-iam-test-port)
          user   (config/config-str :mb-postgres-aws-iam-test-user)
          dbname (config/config-str :mb-postgres-aws-iam-test-dbname)
          uri (format "postgres://%s:%d/%s?user=%s" host port dbname user)]
      (testing "Connection details are configured"
        (is (string? host))
        (is (string? user))
        (is (int? port))
        (is (string? dbname)))

      (testing "using broken-out details"
        (testing "Can create DataSource with AWS IAM enabled"
          (let [details {:host     host
                         :port     port
                         :user     user
                         :db       dbname
                         :aws-iam  true}
                datasource (mdb.data-source/broken-out-details->DataSource :postgres details)]
            (is (instance? javax.sql.DataSource datasource))

            (testing "Can establish connection using AWS IAM"
              (is (true? (get-connection-and-close! datasource)))))))

      (testing "using uri"
        (testing "Can create DataSource with AWS IAM enabled"
          (let [datasource (mdb.data-source/raw-connection-string->DataSource
                            uri nil nil nil true)]
            (is (instance? javax.sql.DataSource datasource))

            (testing "Can establish connection using AWS IAM"
              (is (true? (get-connection-and-close! datasource))))))))
    (log/info "Skipping test: MB_POSTGRES_AWS_IAM_TEST not set")))

(deftest ^:mb/once mysql-aws-iam-test
  (testing "MySQL App DB connection with AWS IAM authentication"
    (if (config/config-bool :mb-mysql-aws-iam-test)
      (let [host     (config/config-str :mb-mysql-aws-iam-test-host)
            port     (config/config-int :mb-mysql-aws-iam-test-port)
            user     (config/config-str :mb-mysql-aws-iam-test-user)
            dbname   (config/config-str :mb-mysql-aws-iam-test-dbname)
            ssl-cert (config/config-str :mb-mysql-aws-iam-test-ssl-cert)
            uri (format "mysql://%s:%d/%s?user=%s&%s" host port dbname user
                        (if (= ssl-cert "trust")
                          "trustServerCertificate=true"
                          (str "?sslMode=VERIFY_CA&serverSslCert=" ssl-cert)))]
        (testing "Connection details are configured"
          (is (string? host))
          (is (string? user))
          (is (int? port))
          (is (string? dbname)))

        (testing "SSL certificate is configured"
          (is (string? ssl-cert)))

        (testing "using broken-out details"
          (testing "Can create DataSource with AWS IAM enabled"
            (let [details {:host     host
                           :port     port
                           :user     user
                           :db       dbname
                           :ssl-cert ssl-cert
                           :aws-iam  true}
                  datasource (mdb.data-source/broken-out-details->DataSource :mysql details)]
              (is (instance? javax.sql.DataSource datasource))

              (testing "Can establish connection using AWS IAM"
                (is (true? (get-connection-and-close! datasource)))))))

        (testing "using uri"
          (testing "Can create DataSource with AWS IAM enabled"
            (let [datasource (mdb.data-source/raw-connection-string->DataSource
                              uri nil nil nil true)]
              (is (instance? javax.sql.DataSource datasource))

              (testing "Can establish connection using AWS IAM"
                (is (true? (get-connection-and-close! datasource))))))))
      (log/info "Skipping test: MB_MYSQL_AWS_IAM_TEST not set"))))
