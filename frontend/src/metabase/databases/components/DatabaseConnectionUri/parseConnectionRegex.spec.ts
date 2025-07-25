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

describe("parseConnectionUriRegex", () => {
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

describe("parseConnectionUriRegex - Oracle", () => {
  it("should parse an Oracle connection string", () => {
    const connectionString = "oracle://user:pass@host:1521/servicename?foo=bar";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      host: "host",
      port: "1521",
      service_name: "servicename",
      params: {
        foo: "bar",
      },
      protocol: "oracle",
      hasJdbcPrefix: false,
    });
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

describe("parseConnectionUriRegex - MongoDB", () => {
  it("should parse a MongoDB connection string", () => {
    const connectionString =
      "mongodb://user:pass@host1:27017,host2:27018/dbname?replicaSet=rs0";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      hosts: "host1:27017,host2:27018",
      database: "dbname",
      params: {
        replicaSet: "rs0",
      },
      protocol: "mongodb",
      hasJdbcPrefix: false,
    });
  });
});

describe("parseConnectionUriRegex - Redis", () => {
  it("should parse a Redis connection string", () => {
    const connectionString = "redis://:password@host:6379/0";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      password: "password",
      host: "host",
      port: "6379",
      database: "0",
      protocol: "redis",
      hasJdbcPrefix: false,
      params: undefined,
    });
  });
});

describe("parseConnectionUriRegex - Cassandra", () => {
  it("should parse a Cassandra connection string", () => {
    const connectionString =
      "cassandra://user:pass@host1,host2/keyspace?consistency=quorum";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      hosts: "host1,host2",
      keyspace: "keyspace",
      params: {
        consistency: "quorum",
      },
      protocol: "cassandra",
      hasJdbcPrefix: false,
    });
  });
});

describe("parseConnectionUriRegex - MariaDB", () => {
  it.skip("should parse a MariaDB connection string", () => {
    const connectionString = "mariadb://user:pass@host:3306/dbname?ssl=true";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      host: "host",
      port: "3306",
      database: "dbname",
      params: "ssl=true",
      protocol: "mariadb",
      hasJdbcPrefix: false,
    });
  });
});

describe("parseConnectionUriRegex - DB2", () => {
  it("should parse a DB2 connection string", () => {
    const connectionString =
      "db2://user:pass@host:50000/dbname?sslConnection=true";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual({
      username: "user",
      password: "pass",
      host: "host",
      port: "50000",
      database: "dbname",
      params: {
        sslConnection: "true",
      },
      protocol: "db2",
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

describe("parseConnectionUriRegex - Clickhouse", () => {
  it("should parse a Clickhouse connection string", () => {
    const connectionString = "jdbc:clickhouse://127.0.0.1:8123/myDatabase";
    const result = parseConnectionUriRegex(connectionString);
    expect(result).toEqual(
      expect.objectContaining({
        protocol: "clickhouse",
        host: "127.0.0.1",
        port: "8123",
        hasJdbcPrefix: true,
        path: "myDatabase",
      }),
    );
  });
});
