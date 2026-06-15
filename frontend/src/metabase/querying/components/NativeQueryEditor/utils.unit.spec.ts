import {
  canFormatForEngine,
  formatQuery,
  getCurrentQuery,
} from "metabase/querying/components/NativeQueryEditor/utils";

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

  describe("getCurrentQuery", () => {
    it("should return null when there are no semicolons", () => {
      expect(getCurrentQuery("SELECT 1", 0)).toBeNull();
      expect(getCurrentQuery("SELECT 1", 4)).toBeNull();
      expect(getCurrentQuery("SELECT 1", 8)).toBeNull();
    });

    it("should return null for single statement ending with semicolon", () => {
      expect(getCurrentQuery("SELECT 1;", 0)).toBeNull();
      expect(getCurrentQuery("SELECT 1;", 4)).toBeNull();
      expect(getCurrentQuery("SELECT 1;", 8)).toBeNull();
    });

    it("should return the first statement when cursor is in the first statement", () => {
      const query = "SELECT 1; SELECT 2;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 1");
      expect(getCurrentQuery(query, 4)).toBe("SELECT 1");
      expect(getCurrentQuery(query, 8)).toBe("SELECT 1");
    });

    it("should return the second statement when cursor is in the second statement", () => {
      const query = "SELECT 1; SELECT 2;";
      expect(getCurrentQuery(query, 9)).toBe("SELECT 2");
      expect(getCurrentQuery(query, 13)).toBe("SELECT 2");
      expect(getCurrentQuery(query, 17)).toBe("SELECT 2");
    });

    it("should handle cursor at the very end of the query", () => {
      const query = "SELECT 1; SELECT 2;";
      expect(getCurrentQuery(query, query.length)).toBe("SELECT 2");
    });

    it("should handle cursor on the semicolon itself", () => {
      const query = "SELECT 1; SELECT 2";
      // Cursor at position 8 (the semicolon)
      expect(getCurrentQuery(query, 8)).toBe("SELECT 1");
    });

    it("should handle multiple semicolons correctly", () => {
      const query = "SELECT 1; SELECT 2; SELECT 3;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 1");
      expect(getCurrentQuery(query, 10)).toBe("SELECT 2");
      expect(getCurrentQuery(query, 20)).toBe("SELECT 3");
    });

    it("should handle queries with newlines", () => {
      const query = "SELECT 1\nFROM t1;\nSELECT 2\nFROM t2;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 1\nFROM t1");
      expect(getCurrentQuery(query, 15)).toBe("SELECT 2\nFROM t2");
    });

    it("should trim whitespace from extracted queries", () => {
      const query = "  SELECT 1  ;  SELECT 2  ;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 1");
      expect(getCurrentQuery(query, 15)).toBe("SELECT 2");
    });

    it("should not split on semicolons inside single-quoted strings", () => {
      const query = "SELECT ';' as punct; SELECT 2;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT ';' as punct");
      expect(getCurrentQuery(query, 5)).toBe("SELECT ';' as punct");
      expect(getCurrentQuery(query, 22)).toBe("SELECT 2");
    });

    it("should not split on semicolons inside double-quoted identifiers", () => {
      const query = 'SELECT "a;b" AS x; SELECT 2;';
      expect(getCurrentQuery(query, 0)).toBe('SELECT "a;b" AS x');
      expect(getCurrentQuery(query, 19)).toBe("SELECT 2");
    });

    it("should not split on semicolons inside single-line comments", () => {
      const query = "SELECT 1 -- this; is a comment;\nSELECT 2;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 1 -- this; is a comment");
      expect(getCurrentQuery(query, 35)).toBe("SELECT 2");
    });

    it("should not split on semicolons inside multi-line comments", () => {
      const query = "SELECT 1 /* this; is; a comment */; SELECT 2;";
      expect(getCurrentQuery(query, 0)).toBe(
        "SELECT 1 /* this; is; a comment */",
      );
      expect(getCurrentQuery(query, 38)).toBe("SELECT 2");
    });

    it("should handle escaped single quotes '' inside string literals", () => {
      const query = "SELECT 'it''s; here' AS msg; SELECT 2;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT 'it''s; here' AS msg");
      expect(getCurrentQuery(query, 30)).toBe("SELECT 2");
    });

    it("should handle escaped double quotes inside identifiers", () => {
      const query = 'SELECT "a""b;c" AS x; SELECT 2;';
      expect(getCurrentQuery(query, 0)).toBe('SELECT "a""b;c" AS x');
      expect(getCurrentQuery(query, 24)).toBe("SELECT 2");
    });

    it("should handle mixed strings, comments, and real statement separators", () => {
      const query =
        "SELECT ';' as a; -- comment;\nSELECT 'x;y' as b /* block; */; SELECT 3;";
      expect(getCurrentQuery(query, 0)).toBe("SELECT ';' as a");
      expect(getCurrentQuery(query, 20)).toBe("-- comment;\nSELECT 'x;y' as b /* block; */");
      expect(getCurrentQuery(query, 65)).toBe("SELECT 3");
    });

    it("should return null when the only semicolons are inside strings", () => {
      const query = "SELECT 'hello; world' AS msg";
      expect(getCurrentQuery(query, 0)).toBeNull();
      expect(getCurrentQuery(query, 15)).toBeNull();
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
});
