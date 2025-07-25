import { parseConnectionUriRegex } from "./parseConnectionRegex";

describe("parseConnectionUriRegex - Amazon Athena", () => {
  it("should parse a basic Amazon Athena connection string", () => {
    const connectionString =
      "jdbc:athena://WorkGroup=primary;Region=us-east-1;";
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
    const connectionString =
      "jdbc:redshift://examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com:5439/dbname";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "redshift",
        host: "examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com",
        port: "5439",
        database: "dbname",
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
          PWD: "password%3Apassword",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - BigQuery", () => {
  it("should parse a BigQuery connection string", () => {
    const connectionString =
      "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=MyBigQueryProject;OAuthType=1;";
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
    const connectionString =
      "jdbc:clickhouse://john:aa@127.0.0.1:8123/myDatabase?param1=value1";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "clickhouse",
        host: "127.0.0.1",
        port: "8123",
        hasJdbcPrefix: true,
        database: "myDatabase",
        params: {
          param1: "value1",
        },
      }),
    );
  });
});

describe("parseConnectionUriRegex - Databricks", () => {
  it("should parse a Databricks connection string", () => {
    const connectionString =
      "jdbc:databricks://127.0.0.1:8123;httpPath=/sql/1.0/endpoints/abc;OAuthSecret=1234567890;OAuth2ClientId=xyz";
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
    const connectionString =
      "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true";
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
    const connectionString = "jdbc:mysql://user:pass@host:3306/dbname?ssl=true";
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

describe("parseConnectionUriRegex - PostgreSQL", () => {
  it("should parse a PostgreSQL connection string", () => {
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
    const connectionString = "sqlite:///C:/path/to/database.db";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      protocol: "sqlite",
      filepath: "C:/path/to/database.db",
      hasJdbcPrefix: false,
    });
  });
});

describe("parseConnectionUriRegex - Snowflake", () => {
  it("should parse a Snowflake connection string", () => {
    const connectionString =
      "snowflake://johnsnow.snowflakecomputing.com/?db=maindb&warehouse=mainwarehouse";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        username: undefined,
        password: undefined,
        host: "johnsnow.snowflakecomputing.com",
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
