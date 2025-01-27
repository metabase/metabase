import { json } from "@codemirror/lang-json";
import {
  MySQL,
  PLSQL,
  PostgreSQL,
  StandardSQL,
  sql,
} from "@codemirror/lang-sql";
import type { LanguageSupport } from "@codemirror/language";

type Dialect = {
  spec: {
    keywords?: string;
  };
  dialect?: {
    words?: Record<string, any>;
  };
};

type Source = {
  language: LanguageSupport;
  dialect?: Dialect;
  keywords?: {
    words: string[];
    caseSensitive?: boolean;
  };
};

const engineToDialect = {
  "bigquery-cloud-sdk": StandardSQL,
  mysql: MySQL,
  oracle: PLSQL,
  postgres: PostgreSQL,
  // TODO:
  // "presto-jdbc": "trino",
  // redshift: "redshift",
  // snowflake: "snowflake",
  // sparksql: "spark",
  // h2: "h2",
};

const mongoKeywords = {
  caseSensitive: true,
  // See
  // - https://www.mongodb.com/docs/manual/reference/operator/aggregation/
  words: [
    "$",
    "$abs",
    "$accumulator",
    "$acos",
    "$acosh",
    "$add",
    "$addFields",
    "$addToSet",
    "$all",
    "$allElementsTrue",
    "$and",
    "$and",
    "$anyElementTrue",
    "$arrayElemAt",
    "$arrayToObject",
    "$asin",
    "$asinh",
    "$atan",
    "$atan2",
    "$atanh",
    "$avg",
    "$binarySize",
    "$bitAnd",
    "$bitNot",
    "$bitOr",
    "$bitXor",
    "$bitsAllClear",
    "$bitsAllSet",
    "$bitsAnyClear",
    "$bitsAnySet",
    "$bottom",
    "$bottomN",
    "$bsonSize",
    "$bucket",
    "$bucketAuto",
    "$ceil",
    "$changeStream",
    "$changeStreamSplitLargeEvent",
    "$cmp",
    "$collStats",
    "$concat",
    "$concatArrays",
    "$cond",
    "$convert",
    "$cos",
    "$cosh",
    "$count",
    "$count-accumulator",
    "$covariancePop",
    "$covarianceSamp",
    "$currentOp",
    "$dateAdd",
    "$dateDiff",
    "$dateFromParts",
    "$dateFromString",
    "$dateSubtract",
    "$dateToParts",
    "$dateToString",
    "$dateTrunc",
    "$dayOfMonth",
    "$dayOfWeek",
    "$dayOfYear",
    "$degreesToRadians",
    "$denseRank",
    "$densify",
    "$derivative",
    "$divide",
    "$documentNumber",
    "$documents",
    "$elemMatch",
    "$eq",
    "$eq",
    "$exists",
    "$exp",
    "$expMovingAvg",
    "$expr",
    "$facet",
    "$fill",
    "$filter",
    "$first",
    "$firstN",
    "$floor",
    "$function",
    "$geoIntersects",
    "$geoNear",
    "$geoWithin",
    "$getField",
    "$graphLookup",
    "$group",
    "$gt",
    "$gte",
    "$gte",
    "$hour",
    "$ifNull",
    "$in",
    "$indexOfArray",
    "$indexOfBytes",
    "$indexOfCP",
    "$indexStats",
    "$integral",
    "$isArray",
    "$isNumber",
    "$isoDayOfWeek",
    "$isoWeek",
    "$isoWeekYear",
    "$jsonSchema",
    "$last",
    "$lastN",
    "$let",
    "$limit",
    "$linearFill",
    "$listLocalSessions",
    "$listSampledQueries",
    "$listSearchIndexes",
    "$listSessions",
    "$literal",
    "$ln",
    "$locf",
    "$log",
    "$log10",
    "$lookup",
    "$lt",
    "$lte",
    "$lte",
    "$ltrim",
    "$map",
    "$match",
    "$max",
    "$maxN",
    "$maxN-array-element",
    "$median",
    "$merge",
    "$mergeObjects",
    "$meta",
    "$meta",
    "$millisecond",
    "$min",
    "$minN",
    "$minN-array-element",
    "$minute",
    "$mod",
    "$mod",
    "$month",
    "$multiply",
    "$natural",
    "$ne",
    "$near",
    "$nearSphere",
    "$nin",
    "$nor",
    "$not",
    "$objectToArray",
    "$or",
    "$out",
    "$percentile",
    "$planCacheStats",
    "$pow",
    "$project",
    "$push",
    "$querySettings",
    "$queryStats",
    "$radiansToDegrees",
    "$rand",
    "$range",
    "$rank",
    "$redact",
    "$reduce",
    "$regex",
    "$regexFind",
    "$regexFindAll",
    "$regexMatch",
    "$replaceAll",
    "$replaceOne",
    "$replaceRoot",
    "$replaceWith",
    "$reverseArray",
    "$round",
    "$rtrim",
    "$sample",
    "$sampleRate",
    "$search",
    "$searchMeta",
    "$second",
    "$set",
    "$setDifference",
    "$setEquals",
    "$setField",
    "$setIntersection",
    "$setIsSubset",
    "$setUnion",
    "$setWindowFields",
    "$shardedDataDistribution",
    "$shift",
    "$sin",
    "$sinh",
    "$size",
    "$size",
    "$skip",
    "$slice",
    "$slice",
    "$sort",
    "$sortArray",
    "$sortByCount",
    "$split",
    "$sqrt",
    "$stdDevPop",
    "$stdDevSamp",
    "$strLenBytes",
    "$strLenCP",
    "$strcasecmp",
    "$substr",
    "$substrBytes",
    "$substrCP",
    "$subtract",
    "$sum",
    "$switch",
    "$tan",
    "$tanh",
    "$text",
    "$toBool",
    "$toDate",
    "$toDecimal",
    "$toDouble",
    "$toHashedIndexKey",
    "$toInt",
    "$toLong",
    "$toLower",
    "$toObjectId",
    "$toString",
    "$toUUID",
    "$toUpper",
    "$top",
    "$topN",
    "$trim",
    "$trunc",
    "$tsIncrement",
    "$tsSecond",
    "$type",
    "$type",
    "$unionWith",
    "$unset",
    "$unsetField",
    "$unwind",
    "$vectorSearch",
    "$week",
    "$where",
    "$year",
    "$zip",
    "_id",
  ],
};

export function source(engine?: string | null): Source {
  // TODO: this should be provided by the engine driver through the API
  switch (engine) {
    case "mongo":
      return {
        keywords: mongoKeywords,
        language: json(),
      };

    case "druid":
      return {
        language: json(),
      };

    case "bigquery-cloud-sdk":
    case "mysql":
    case "oracle":
    case "postgres":
    case "presto-jdbc":
    case "redshift":
    case "snowflake":
    case "sparksql":
    case "h2":
    default: {
      const dialect =
        engineToDialect[engine as keyof typeof engineToDialect] ?? StandardSQL;

      const words =
        dialect?.spec?.keywords?.split(" ") ??
        // @ts-expect-error: SQLDialect.dialect is an internal that is exposed
        Object.keys(dialect?.dialect?.words ?? {});

      return {
        language: sql({
          dialect,
          upperCaseKeywords: true,
        }),
        dialect,
        keywords: {
          caseSensitive: false,
          words: words.map(word => word.toUpperCase()),
        },
      };
    }
  }
}

type LanguageOptions = {
  engine?: string | null;
};

export function language({ engine }: LanguageOptions) {
  const { language } = source(engine);
  if (!language) {
    return [];
  }

  return language;
}
