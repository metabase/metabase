const jdbcPrefix = "(?<hasJdbcPrefix>jdbc:)?";
const userPass = "(?:(?<username>[^:/?#]+)(?::(?<password>[^@/?#]*))?@)?";
const host = "(?<host>[^:/?#]+)?(?::(?<port>\\d+)?)?";
const params = "(?:\\?(?<params>.*))?";

const connectionStringRegexes = {
  // PostgreSQL
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

  // MySQL
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

  // Oracle (using Easy Connect syntax)
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

  // SQLite (file path)
  sqlite: new RegExp(
    "^" + jdbcPrefix + "(?<protocol>sqlite):///(?<filepath>.+)$",
    "i",
  ),

  // MongoDB
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
};

export function parseConnectionUriRegex(connectionUri: string) {
  for (const regex of Object.values(connectionStringRegexes)) {
    const match = connectionUri.match(regex);
    if (match) {
      const params = match.groups?.params
        ? Object.fromEntries(new URLSearchParams(match.groups.params))
        : undefined;
      return {
        ...match.groups,
        params,
        hasJdbcPrefix: Boolean(match.groups?.hasJdbcPrefix),
      };
    }
  }
}
