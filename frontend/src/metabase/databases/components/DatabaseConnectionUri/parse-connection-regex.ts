import type { EngineKey } from "metabase-types/api";

export interface RegexFields {
  host?: string;
  port?: string;
  database?: string;
  catalog?: string;
  schema?: string;
  username?: string;
  password?: string;
  protocol?: string;
  params?: Record<string, string | undefined> | undefined;
  path?: string;
  hasJdbcPrefix: boolean;
}

const jdbcPrefix = "(?<hasJdbcPrefix>jdbc:)?";
const userPass = "(?:(?<username>[^:/?#]+)(?::(?<password>[^@/?#]*))?@)?";
const hostAndPort = "(?<host>[^:/?#]+)?(?::(?<port>\\d+)?)?";
const params = "(?:(?<params>.*))?";
const semicolonParams = ";?(?<semicolonParams>.*)?;?";

const druidRegex = new RegExp(
  "^" +
    jdbcPrefix +
    "(?<protocol>avatica)" +
    ":remote:url=(https?://)?(?<host>[^:/]+):(?<port>\\d+)(?<path>/[^;]*)" +
    semicolonParams +
    "$",
  "i",
);

const connectionStringRegexes: Record<
  EngineKey,
  RegExp | RegExp[] | undefined
> = {
  athena: new RegExp(
    "^" +
      jdbcPrefix +
      "(?<protocol>awsathena|athena)://" +
      "((?<host>athena.*com)(?::(?<port>\\d+)?)?)?" +
      ";?" +
      "(?<semicolonParams>.*)?" +
      "$",
    "i",
  ),
  redshift: new RegExp(
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
  "bigquery-cloud-sdk": new RegExp(
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
      "(?<protocol>clickhouse|ch):(?:https?:)?//" +
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
  druid: druidRegex,
  "druid-jdbc": druidRegex,
  mongo: undefined,
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
  postgres: new RegExp(
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
  "presto-jdbc": new RegExp(
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
  sparksql: [
    new RegExp(
      "^" + jdbcPrefix + "(?<protocol>sparksql):" + semicolonParams + "$",
      "i",
    ),
    new RegExp(
      "^" +
        jdbcPrefix +
        "(?<protocol>hive2)://" +
        hostAndPort +
        "(?:/(?<database>[^/?#;]*))?" +
        semicolonParams +
        "$",
      "i",
    ),
  ],
  sqlite: new RegExp(
    "^" + jdbcPrefix + "(?<protocol>sqlite):///(?<path>.+)$",
    "i",
  ),
  sqlserver: new RegExp(
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
  connectionUri: string | undefined,
  engineKey: EngineKey | undefined,
): RegexFields | null {
  if (!connectionUri || !engineKey) {
    return null;
  }

  const regex = connectionStringRegexes[engineKey];
  const trimmedString = connectionUri.trim();

  if (!regex) {
    return null;
  }

  // Some of engines have more than one matching regex
  const candidate: RegExp | undefined = Array.isArray(regex)
    ? regex.find((r) => trimmedString.match(r))
    : regex;

  if (!candidate) {
    return null;
  }

  const match = trimmedString.match(candidate);

  if (match) {
    const params = match.groups?.params
      ? Object.fromEntries(new URLSearchParams(match.groups.params))
      : undefined;
    const semicolonParams = mapSemicolonParams(match.groups?.semicolonParams);
    return {
      ...match.groups,
      username: safeDecode(match.groups?.username),
      password: safeDecode(match.groups?.password),
      params: params ?? semicolonParams,
      hasJdbcPrefix: Boolean(match.groups?.hasJdbcPrefix),
    };
  }

  return null;
}

function mapSemicolonParams(semicolonParams: string | undefined) {
  if (!semicolonParams) {
    return undefined;
  }

  return semicolonParams
    .split(";")
    .reduce<Record<string, string | undefined>>((acc, param) => {
      const [key, value] = param.split("=");
      if (key !== "") {
        acc[key] = safeDecode(value);
      }
      return acc;
    }, {});
}

function safeDecode(text: string | undefined) {
  if (!text) {
    return text;
  }

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
