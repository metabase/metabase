import { enginesConfig } from "./engines-config";
import { parseConnectionUriRegex } from "./parseConnectionRegex";

describe("parseConnectionUriRegex - Amazon Athena", () => {
  it("should parse a basic Amazon Athena connection string", () => {
    const connectionString = enginesConfig.get("athena")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          WorkGroup: "primary",
          Region: "us-east-1",
        },
        protocol: "athena",
        hasJdbcPrefix: true,
      }),
    );
  });

  it("should parse a Athena connection string with host", () => {
    const connectionString =
      "jdbc:awsathena://athena.us-east-1.amazonaws.com:443;User=EXAMPLEKEY;Password=EXAMPLESECRETKEY;S3OutputLocation=s3://example-bucket-name-us-east-1";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "awsathena",
        host: "athena.us-east-1.amazonaws.com",
        port: "443",
        hasJdbcPrefix: true,
        params: {
          User: "EXAMPLEKEY",
          Password: "EXAMPLESECRETKEY",
          S3OutputLocation: "s3://example-bucket-name-us-east-1",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Amazon Redshift", () => {
  it("should parse a Amazon Redshift connection string", () => {
    const connectionString = enginesConfig.get("redshift")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "redshift",
        host: "examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com",
        port: "5439",
        database: "dev",
        hasJdbcPrefix: true,
      }),
    );
  });

  it("should parse a Amazon Redshift connection string", () => {
    const connectionString =
      "jdbc:redshift://a.b.us-west-2.redshift.amazonaws.com:5439/dbname;UID=amazon;PWD=password%3Apassword";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "redshift",
        host: "a.b.us-west-2.redshift.amazonaws.com",
        port: "5439",
        database: "dbname",
        hasJdbcPrefix: true,
        params: {
          UID: "amazon",
          PWD: "password:password",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - BigQuery", () => {
  it("should parse a BigQuery connection string", () => {
    const connectionString =
      enginesConfig.get("bigquery-cloud-sdk")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "bigquery",
        params: {
          ProjectId: "MyBigQueryProject",
          OAuthType: "1",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Clickhouse", () => {
  it("should parse a Clickhouse connection string", () => {
    const connectionString = enginesConfig.get("clickhouse")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "clickhouse",
        host: "localhost",
        port: "8443",
        hasJdbcPrefix: true,
        params: {
          ssl: "true",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Databricks", () => {
  it("should parse a Databricks connection string", () => {
    const connectionString = enginesConfig.get("databricks")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "databricks",
        host: "127.0.0.1",
        port: "8123",
        hasJdbcPrefix: true,
        params: {
          httpPath: "/sql/1.0/endpoints/abc",
          OAuthSecret: "1234567890",
          OAuth2ClientId: "xyz",
        },
      }),
    );
  });

  it("should parse a Databricks connection string with personal access token", () => {
    const connectionString =
      "jdbc:databricks://127.0.0.1:8123;httpPath=/sql/1.0/endpoints/abc;PWD=1234567890;";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "databricks",
        host: "127.0.0.1",
        port: "8123",
        hasJdbcPrefix: true,
        params: {
          httpPath: "/sql/1.0/endpoints/abc",
          PWD: "1234567890",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Druid", () => {
  it("should parse a Druid connection string", () => {
    const connectionString = enginesConfig.get("druid")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "avatica",
        host: "localhost",
        port: "8888",
        path: "/druid/v2/sql/avatica/",
        hasJdbcPrefix: true,
        params: {
          transparent_reconnection: "true",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - MySQL", () => {
  it("should parse a MySQL connection string", () => {
    const connectionString = enginesConfig.get("mysql")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      host: "host",
      port: "3306",
      database: "dbname",
      params: {
        ssl: "true",
      },
      protocol: "mysql",
      hasJdbcPrefix: true,
    });
  });
});

describe("parseConnectionUriRegex - Oracle", () => {
  it("should parse a Oracle connection string", () => {
    const connectionString = enginesConfig.get("oracle")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        host: "mydbhost",
        port: "1521",
        database: "mydbservice",
        params: {
          ssl_server_cert_dn: "ServerDN",
        },
        protocol: "oracle",
        hasJdbcPrefix: true,
      }),
    );
  });
  it("should parse a Oracle connection string with username and password", () => {
    const connectionString =
      "jdbc:oracle:thin:john/pass1234@mydbhost:1521/mydbservice?ssl_server_cert_dn=ServerDN";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        host: "mydbhost",
        port: "1521",
        username: "john",
        password: "pass1234",
        database: "mydbservice",
        params: {
          ssl_server_cert_dn: "ServerDN",
        },
        protocol: "oracle",
        hasJdbcPrefix: true,
      }),
    );
  });
});

describe("parseConnectionUriRegex - PostgreSQL", () => {
  it("should parse a PostgreSQL connection string", () => {
    const connectionString = enginesConfig.get("postgres")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      host: "localhost",
      port: "5432",
      database: "mydb",
      protocol: "postgresql",
      hasJdbcPrefix: true,
    });
  });

  it("should parse a PostgreSQL connection string with encoded parameters", () => {
    const connectionString =
      "postgres://user:pass@host:5432/dbname?param1=pe%40ce%26lo%2F3";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      host: "host",
      port: "5432",
      database: "dbname",
      params: {
        param1: "pe@ce&lo/3",
      },
      protocol: "postgres",
      hasJdbcPrefix: false,
    });
  });

  it("should parse connection without password", () => {
    const connectionString = "postgresql://user@localhost:5432/dbname";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        username: "user",
        password: undefined,
      }),
    );
  });
});

describe("parseConnectionUriRegex - Presto", () => {
  it("should parse a Presto connection string", () => {
    const connectionString =
      "jdbc:presto://host:1234/sample-catalog/sample-schema?SSL=true&SSLTrustStorePassword=1234";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "presto",
        host: "host",
        port: "1234",
        catalog: "sample-catalog",
        schema: "sample-schema",
        hasJdbcPrefix: true,
        params: {
          SSL: "true",
          SSLTrustStorePassword: "1234",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - SQLite", () => {
  it("should parse a SQLite connection string", () => {
    const connectionString = enginesConfig.get("sqlite")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "sqlite",
        path: "C:/path/to/database.db",
        hasJdbcPrefix: true,
      }),
    );
  });
});

describe("parseConnectionUriRegex - Snowflake", () => {
  it("should parse a Snowflake connection string", () => {
    const connectionString = enginesConfig.get("snowflake")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        username: undefined,
        password: undefined,
        host: "example.snowflakecomputing.com",
        database: undefined,
        port: undefined,
        protocol: "snowflake",
        params: {
          db: "maindb",
          warehouse: "mainwarehouse",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Spark SQL", () => {
  it("should parse a Spark SQL connection string", () => {
    const connectionString = enginesConfig.get("sparksql")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "sparksql",
        hasJdbcPrefix: true,
        params: {
          Server: "127.0.0.1",
        },
      }),
    );
  });

  it("should parse a Spark SQL connection string using hive2 protocol", () => {
    const connectionString =
      "jdbc:hive2://127.0.0.1:1234/dbname;transportMode=http;";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          transportMode: "http",
        },
        database: "dbname",
        host: "127.0.0.1",
        port: "1234",
        protocol: "hive2",
        hasJdbcPrefix: true,
      }),
    );
  });
});

describe("parseConnectionUriRegex - SQL Server", () => {
  it("should parse a SQL Server connection string", () => {
    const connectionString = enginesConfig.get("sqlserver")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          databaseName: "mydb",
        },
        host: "mydbhost",
        port: "1433",
        protocol: "sqlserver",
        hasJdbcPrefix: true,
      }),
    );
  });
  it("should parse a SQL Server connection string with username and password", () => {
    const connectionString =
      "jdbc:sqlserver://localhost:1433;encrypt=true;databaseName=AdventureWorks;integratedSecurity=true;username=john;password=password";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          encrypt: "true",
          databaseName: "AdventureWorks",
          integratedSecurity: "true",
          username: "john",
          password: "password",
        },
        host: "localhost",
        port: "1433",
        protocol: "sqlserver",
        hasJdbcPrefix: true,
      }),
    );
  });
});

describe("parseConnectionUriRegex - Starburst", () => {
  it("should parse a Starburst connection string", () => {
    const connectionString = enginesConfig.get("starburst")?.placeholder;
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          user: "test",
          password: "secret",
          SSL: "true",
          roles: "system:myrole",
        },
        host: "starburst.example.com",
        port: "43011",
        catalog: "hive",
        schema: "sales",
        protocol: "trino",
        hasJdbcPrefix: true,
      }),
    );
  });
});

describe("parseConnectionUriRegex - Vertica", () => {
  it("should parse a Vertica connection strin", () => {
    const connectionString =
      "jdbc:vertica://vertica.example.com:1234/databaseName";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        host: "vertica.example.com",
        port: "1234",
        database: "databaseName",
        protocol: "vertica",
        hasJdbcPrefix: true,
      }),
    );
  });
  it("should parse a Vertica connection string with username and password", () => {
    const connectionString =
      "jdbc:vertica://vertica.example.com:1234/databaseName?user=jane&password=pass1234";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        params: {
          user: "jane",
          password: "pass1234",
        },
        host: "vertica.example.com",
        port: "1234",
        database: "databaseName",
        protocol: "vertica",
        hasJdbcPrefix: true,
      }),
    );
  });
});
