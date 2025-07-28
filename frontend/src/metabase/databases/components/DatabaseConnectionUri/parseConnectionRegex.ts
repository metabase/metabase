export interface RegexFields {
  host?: string;
  port?: string;
  database?: string;
  catalog?: string;
  schema?: string;
  username?: string;
  password?: string;
  protocol?: string;
  params?: Record<string, string> | undefined;
  path?: string;
  hasJdbcPrefix: boolean;
}

const jdbcPrefix = "(?<hasJdbcPrefix>jdbc:)?";
const userPass = "(?:(?<username>[^:/?#]+)(?::(?<password>[^@/?#]*))?@)?";
const hostAndPort = "(?<host>[^:/?#]+)?(?::(?<port>\\d+)?)?";
const params = "(?:\\?(?<params>.*))?";
const semicolonParams = ";?(?<semicolonParams>.*)?;?";
// const semicolonParams = "([^;]*)(?<semicolonParams>.*)?";

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
      hostAndPort +
      "(?:/(?<database>[^/?#;]*))?" +
      ";?" +
      "(?<semicolonParams>.*)?" +
      "$",
    "i",
  ),
  bigquery: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>bigquery)://" +
      "(https?://)?(?<host>[^:/]+)(?<path>/[^;]*):(?<port>\\d+)" +
      semicolonParams +
      "$",
    "i",
  ),
  clickhouse: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>clickhouse)://" +
      userPass +
      hostAndPort +
      "(?:/(?<database>[^/?#]*))?" +
      params,
  ),
  databricks: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>databricks)://" +
      hostAndPort +
      "(?:/(?<schema>[^/?#]*))?" +
      semicolonParams +
      "$",
    "i",
  ),
  druid: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>avatica)" +
      ":remote:url=(https?://)?(?<host>[^:/]+):(?<port>\\d+)(?<path>/[^;]*)" +
      semicolonParams +
      "$",
    "i",
  ),
  mysql: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>mysql)://" +
      userPass +
      hostAndPort +
      "(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  postgresql: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>postgres(?:ql)?)://" +
      userPass +
      hostAndPort +
      "(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  presto: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>presto)://" +
      hostAndPort +
      "(?:/(?<catalog>[^/?#]*)/(?<schema>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  oracle: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>oracle):(?<subprotocol>thin):" +
      "(?:(?<username>[^@/]+)/(?<password>[^@/]+))?" +
      "@" +
      "(?<host>[^:/?#]+)(?::(?<port>\\d+))?(?:/(?<database>[^/?#]+))?" +
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

  snowflake: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>snowflake)://" +
      userPass +
      hostAndPort +
      "(?:/(?<database>[^/?#]*)?)?" +
      params +
      "$",
    "i",
  ),

  "spark-sql": new RegExp(
    "^" + jdbcPrefix + "(?<protocol>sparksql):" + semicolonParams + "$",
    "i",
  ),

  "spark-sql-hive2": new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>hive2)://" +
      hostAndPort +
      "(?:/(?<database>[^/?#;]*))?" +
      semicolonParams +
      "$",
    "i",
  ),
  "sql-server": new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>sqlserver)://" +
      hostAndPort +
      semicolonParams +
      "$",
    "i",
  ),
  starburst: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>trino)://" +
      hostAndPort +
      "(?:/(?<catalog>[^/?#]*)/(?<schema>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
  vertica: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>vertica)://" +
      hostAndPort +
      "(?:/(?<database>[^/?#]*))?" +
      params +
      "$",
    "i",
  ),
};

export function parseConnectionUriRegex(
  connectionUri: string,
): RegexFields | null {
  for (const regex of Object.values(connectionStringRegexes)) {
    const match = connectionUri.match(regex);
    if (match) {
      const params = match.groups?.params
        ? Object.fromEntries(new URLSearchParams(match.groups.params))
        : undefined;
      const semicolonParams = mapSemicolonParams(match.groups?.semicolonParams);
      return {
        ...match.groups,
        params: params ?? semicolonParams,
        hasJdbcPrefix: Boolean(match.groups?.hasJdbcPrefix),
      };
    }
  }

  return null;
}

function mapSemicolonParams(semicolonParams: string | undefined) {
  if (!semicolonParams) {
    return undefined;
  }

  return semicolonParams
    .split(";")
    .reduce<Record<string, string>>((acc, param) => {
      const [key, value] = param.split("=");
      if (key !== "") {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {});
}
