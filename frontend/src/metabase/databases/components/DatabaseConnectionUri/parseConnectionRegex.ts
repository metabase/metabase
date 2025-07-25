export interface RegexFields {
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  protocol?: string;
  params?: Record<string, string> | undefined;
  path?: string;
  hasJdbcPrefix: boolean;
}

const jdbcPrefix = "(?<hasJdbcPrefix>jdbc:)?";
const userPass = "(?:(?<username>[^:/?#]+)(?::(?<password>[^@/?#]*))?@)?";
const host = "(?<host>[^:/?#]+)?(?::(?<port>\\d+)?)?";
const params = "(?:\\?(?<params>.*))?";
const path = "(?:/(?<path>[^/?#]*))?";
const semicolonParams = "([^;]*)(?<semicolonParams>.*)?";

const connectionStringRegexes = {
  "amazon-athena": new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>awsathena|athena)://" +
      "((?<host>athena.*com)(?::(?<port>\\d+)?)?)?" +
      ";?" +
      "(?<semicolonParams>.*)?" +
      "$",
    "i",
  ),
  "amazon-redshift": new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>redshift)://" +
      userPass +
      host +
      "(?:/(?<database>[^/?#;]*))?" +
      ";?" +
      "(?<semicolonParams>.*)?" +
      "$",
    "i",
  ),
  bigquery: new RegExp(
    "^" + jdbcPrefix + "(?<protocol>bigquery)://" + semicolonParams + "$",
    "i",
  ),
  postgresql: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>postgres(?:ql)?)://" +
      userPass +
      host +
      "(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  mysql: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>mysql)://" +
      userPass +
      host +
      "(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  oracle: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>oracle)://" +
      userPass +
      "(?<host>[^:/?#]+)(?::(?<port>\\d+))?(?:/(?<service_name>[^/?#]+))?" +
      params +
      "$",
    "i",
  ),

  sqlite: new RegExp(
    "^" + jdbcPrefix + "(?<protocol>sqlite):///(?<filepath>.+)$",
    "i",
  ),

  mongodb: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>mongodb(?:\\+srv)?)://" +
      userPass +
      "(?<hosts>[^/?#]+)(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),

  // Redis (URI scheme)
  redis: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>redis)://(?::(?<password>[^@]+)@)?(?<host>[^:/?#]+)(?::(?<port>\\d+))?(?:/(?<database>\\d+))?",
    "i",
  ),

  // Cassandra (using contact points)
  cassandra: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>cassandra)://" +
      userPass +
      "(?<hosts>[^/?#]+)(?:/(?<keyspace>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),

  // MariaDB (similar to MySQL)
  mariadb: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>mariadb)://" +
      userPass +
      "(?<host>[^:/?#]+)?(?::(?<port>\\d+))?(?:/(?<database>[^/?#]*))?(?:\\?(?<params>.*))?$",
    "i",
  ),

  // IBM DB2
  db2: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>db2)://" +
      userPass +
      "(?<host>[^:/?#]+)(?::(?<port>\\d+))?(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),

  snowflake: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>snowflake)://" +
      userPass +
      host +
      "(?:/(?<database>[^/?#]*)?)?" +
      params +
      "$",
    "i",
  ),

  clickhouse: new RegExp(
    "^" + jdbcPrefix + "(?<protocol>clickhouse)://" + userPass + host + path,
  ),
};

export function parseConnectionUriRegex(
  connectionUri: string,
): RegexFields | null {
  for (const regex of Object.values(connectionStringRegexes)) {
    const match = connectionUri.match(regex);
    if (match) {
      console.log({ match });
      const params = match.groups?.params
        ? Object.fromEntries(new URLSearchParams(match.groups.params))
        : undefined;
      const semicolonParams = match.groups?.semicolonParams
        ? match.groups.semicolonParams.split(";").reduce(
            (acc, param) => {
              const [key, value] = param.split("=");
              acc[key] = value;
              return acc;
            },
            {} as Record<string, string>,
          )
        : undefined;
      console.log(semicolonParams);
      return {
        ...match.groups,
        params: params ?? semicolonParams,
        hasJdbcPrefix: Boolean(match.groups?.hasJdbcPrefix),
      };
    }
  }

  return null;
}
