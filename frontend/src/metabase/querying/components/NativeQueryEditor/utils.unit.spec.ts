import { createMockMetadata } from "__support__/metadata";
import {
  canFormatForEngine,
  formatQuery,
  updateSnippet,
} from "metabase/querying/components/NativeQueryEditor/utils";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import {
  createMockNativeQuerySnippet,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const SNIPPET_ID = 1;

const OLD_SNIPPET = createMockNativeQuerySnippet({
  id: SNIPPET_ID,
  name: "old-filter",
  content: "1 = 1",
});

function createSnippetQuery(newSnippet: typeof OLD_SNIPPET) {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    snippets: [newSnippet],
  });
  const query = Lib.createTestNativeQuery(
    createMetadataProvider({ databaseId: SAMPLE_DB_ID, metadata }),
    { query: "select * from products where {{snippet: old-filter}}" },
  );
  return Lib.withTemplateTags(query, {
    "snippet: old-filter": createMockTemplateTag({
      name: "snippet: old-filter",
      "display-name": "Snippet: Old Filter",
      type: "snippet",
      "snippet-id": SNIPPET_ID,
      "snippet-name": "old-filter",
    }),
  });
}

const formattingTestCases = [
  {
    engine: "mysql",
    input:
      "select CONCAT(first_name, ' ', last_name) AS full_name, YEAR(CURDATE()) - YEAR(birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;",
    output: `SELECT
  CONCAT(first_name, ' ', last_name) AS full_name,
  YEAR(CURDATE()) - YEAR(birth_date) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "postgres",
    input:
      "select first_name || ' ' || last_name AS full_name, EXTRACT(YEAR FROM AGE(birth_date)) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;\n",
    output: `SELECT
  first_name || ' ' || last_name AS full_name,
  EXTRACT(
    YEAR
    FROM
      AGE (birth_date)
  ) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "snowflake",
    input:
      "select CONCAT(first_name, ' ', last_name) AS full_name, DATEDIFF(year, birth_date, CURRENT_DATE()) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;\n",
    output: `SELECT
  CONCAT(first_name, ' ', last_name) AS full_name,
  DATEDIFF(YEAR, birth_date, CURRENT_DATE()) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "oracle",
    input:
      "select first_name || ' ' || last_name AS full_name, EXTRACT(YEAR FROM SYSDATE) - EXTRACT(YEAR FROM birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name FETCH FIRST 10 ROWS ONLY;\n",
    output: `SELECT
  first_name || ' ' || last_name AS full_name,
  EXTRACT(
    YEAR
    FROM
      SYSDATE
  ) - EXTRACT(
    YEAR
    FROM
      birth_date
  ) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
FETCH FIRST
  10 ROWS ONLY;`,
  },
  {
    engine: "redshift",
    input:
      "select CONCAT(first_name, ' ', last_name) AS full_name, DATE_PART(year, GETDATE()) - DATE_PART(year, birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;\n",
    output: `SELECT
  CONCAT(first_name, ' ', last_name) AS full_name,
  DATE_PART(year, GETDATE()) - DATE_PART(year, birth_date) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "sparksql",
    input:
      "select CONCAT(first_name, ' ', last_name) AS full_name, YEAR(current_date()) - YEAR(birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;\n",
    output: `SELECT
  CONCAT(first_name, ' ', last_name) AS full_name,
  YEAR(current_date()) - YEAR(birth_date) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "presto-jdbc",
    input:
      "select CONCAT(first_name, ' ', last_name) AS full_name, EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name LIMIT 10;\n",
    output: `SELECT
  CONCAT(first_name, ' ', last_name) AS full_name,
  EXTRACT(
    YEAR
    FROM
      CURRENT_DATE
  ) - EXTRACT(
    YEAR
    FROM
      birth_date
  ) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
LIMIT
  10;`,
  },
  {
    engine: "h2", // Uses ANSI SQL formatter
    input:
      "SELECT first_name || ' ' || last_name AS full_name, EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM birth_date) AS age FROM {{#1-users}} WHERE status = 'active' and {{id}} and [[ user_role = {{role}} ]] ORDER BY full_name FETCH FIRST 10 ROWS ONLY;",
    output: `SELECT
  first_name || ' ' || last_name AS full_name,
  EXTRACT(
    YEAR
    FROM
      CURRENT_DATE
  ) - EXTRACT(
    YEAR
    FROM
      birth_date
  ) AS age
FROM
  {{#1-users}}
WHERE
  status = 'active'
  AND {{id}}
  AND [[ user_role = {{role}} ]]
ORDER BY
  full_name
FETCH FIRST
  10 ROWS ONLY;`,
  },
];

describe("utils", () => {
  describe("canFormatForEngine", () => {
    it("should return true for SQL engines", () => {
      expect(canFormatForEngine("postgres")).toBe(true);
      expect(canFormatForEngine("mysql")).toBe(true);
      expect(canFormatForEngine("snowflake")).toBe(true);
      expect(canFormatForEngine("redshift")).toBe(true);
      expect(canFormatForEngine("bigquery")).toBe(true);
      expect(canFormatForEngine("oracle")).toBe(true);
      expect(canFormatForEngine("snowflake")).toBe(true);
      expect(canFormatForEngine("sparksql")).toBe(true);
      expect(canFormatForEngine("vertica")).toBe(true);
    });

    it("should return false for non-SQL engines and unsupported SQL engines", () => {
      expect(canFormatForEngine("mongo")).toBe(false);
      expect(canFormatForEngine("druid")).toBe(false);
      expect(canFormatForEngine("sqlite")).toBe(false);
      expect(canFormatForEngine("sqlserver")).toBe(false);
    });
  });

  describe("formatQuery", () => {
    it.each(formattingTestCases)(
      "should format %s query",
      async ({ engine, input, output }) => {
        const formatted = await formatQuery(input, engine);
        expect(formatted).toBe(output);
      },
    );
  });

  describe("updateSnippet", () => {
    it("should rename snippet references after snippet rename", () => {
      const newSnippet = { ...OLD_SNIPPET, name: "new-filter" };
      const query = updateSnippet(
        createSnippetQuery(newSnippet),
        OLD_SNIPPET,
        newSnippet,
      );

      expect(Lib.rawNativeQuery(query)).toBe(
        "select * from products where {{snippet: new-filter}}",
      );
      expect(Object.keys(Lib.templateTags(query))).toEqual([
        "snippet: new-filter",
      ]);
    });

    it("should add variables from edited snippet content", () => {
      const newSnippet = {
        ...OLD_SNIPPET,
        content: "category = {{category}}",
        template_tags: {
          category: createMockTemplateTag({
            name: "category",
            "display-name": "Category",
            type: "text",
          }),
        },
      };
      const query = updateSnippet(
        createSnippetQuery(newSnippet),
        OLD_SNIPPET,
        newSnippet,
      );

      expect(Object.keys(Lib.templateTags(query)).sort()).toEqual([
        "category",
        "snippet: old-filter",
      ]);
    });
  });
});
