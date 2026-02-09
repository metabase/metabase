import json
import re

import sqlglot
import sqlglot.lineage as lineage
import sqlglot.optimizer as optimizer
import sqlglot.optimizer.qualify as qualify
from sqlglot import exp
from sqlglot.errors import ParseError, OptimizeError

def needs_quoting(name: str) -> bool:
    """Check if an identifier needs to be quoted due to special characters."""
    if not name:
        return False
    # Check for common problematic characters
    if '-' in name or ' ' in name:
        return True
    # Starts with a digit
    if name[0].isdigit():
        return True
    return False

def parse_sql(sql: str, dialect: str = "postgres"):
    """Parses SQL and returns the root Expression."""
    return sqlglot.parse_one(sql, read=dialect)

def get_ast_json(expression) -> any:
    """Recursively converts an expression to a JSON-dict."""

    # 1. Handle SQLGlot Expressions (Recursive step)
    if isinstance(expression, exp.Expression):
        return {
            "type": type(expression).__name__,
            "args": {
                k: [get_ast_json(n) for n in v] if isinstance(v, list)
                   else get_ast_json(v)
                for k, v in expression.args.items()
            }
        }

    # 2. Handle Primitives (Pass through safely)
    if isinstance(expression, (str, int, float, bool, type(None))):
        return expression

    # 3. THE FIX: Handle Enums/Types
    # If we reach here, it's an object (like Type.DATE) that JSON hates.
    # We convert it to its string representation (e.g., "DataType.Type.DATE")
    return str(expression)

def get_tables(expression, include_ctes: bool = True) -> list:
    """Finds all tables. set include_ctes=False to exclude WITH clauses."""
    tables = set()
    cte_names = set()

    if not include_ctes:
        for cte in expression.find_all(exp.CTE):
            if cte.alias:
                cte_names.add(cte.alias)

    for table in expression.find_all(exp.Table):
        # If we are excluding CTEs and this table matches a CTE name, skip it
        if not include_ctes and table.name in cte_names:
            continue
        tables.add(table.name)

    return sorted(list(tables))

def get_columns(expression) -> list:
    """Returns all referenced columns (in SELECT, WHERE, GROUP BY, etc)."""
    cols = {col.name for col in expression.find_all(exp.Column)}
    return sorted(list(cols))

def get_projections(expression) -> list:
    """Returns the top-level output fields/aliases."""
    return expression.named_selects

def get_table_joins(expression) -> dict:
    """
    Extracts table relationships from JOIN clauses.
    Returns a dict with:
    - tables: list of all table names
    - joins: list of {left_table, right_table, join_type} relationships
    """
    tables = set()
    joins = []

    # Collect all tables
    for table in expression.find_all(exp.Table):
        tables.add(table.name)

    # Find the FROM clause which contains the join chain
    for select in expression.find_all(exp.Select):
        # Note: the key is 'from_' not 'from' in sqlglot
        from_expr = select.args.get("from_")
        if not from_expr:
            continue

        # Get the base table (leftmost in the join chain)
        base = from_expr.this
        left_table = None

        if isinstance(base, exp.Table):
            left_table = base.name
        elif isinstance(base, exp.Subquery) and base.alias:
            left_table = base.alias

        # Process joins in order
        join_exprs = select.args.get("joins", [])
        for join in join_exprs:
            if not isinstance(join, exp.Join):
                continue

            # Get the right table
            right_table = None
            if isinstance(join.this, exp.Table):
                right_table = join.this.name
            elif isinstance(join.this, exp.Subquery) and join.this.alias:
                right_table = join.this.alias

            # Determine join type
            join_type = "INNER"
            if join.args.get("side"):
                join_type = join.args["side"].upper()
            if join.args.get("kind"):
                join_type = join.args["kind"].upper()

            if left_table and right_table:
                joins.append({
                    "left_table": left_table,
                    "right_table": right_table,
                    "join_type": join_type
                })

                # For chained joins, all joins are relative to the base table
                # (unless the ON condition references a different table,
                # which would require more sophisticated analysis)

    return {
        "tables": sorted(list(tables)),
        "joins": joins
    }

def analyze_table_joins(sql: str, dialect: str = "postgres") -> str:
    """
    Analyzes a SQL query to extract table names and their join relationships.
    Returns a JSON STRING describing which tables are joined together.

    Example output:
    {
        "tables": ["A", "B", "C", "D"],
        "joins": [
            {"left_table": "A", "right_table": "B", "join_type": "LEFT"},
            {"left_table": "A", "right_table": "C", "join_type": "INNER"},
            {"left_table": "C", "right_table": "D", "join_type": "LEFT"}
        ]
    }
    """
    expression = parse_sql(sql, dialect)
    result = get_table_joins(expression)
    return json.dumps(result)

def analyze(sql: str) -> str:
    """
    Convenience wrapper to run everything at once.
    Returns a JSON STRING to avoid Polyglot object mapping issues.
    """
    expression = parse_sql(sql)
    result = {
        "tables_source": get_tables(expression, include_ctes=False),
        "tables_all": get_tables(expression, include_ctes=True),
        "columns": get_columns(expression),
        "projections": get_projections(expression),
        "ast": get_ast_json(expression),
    }

    # Serialize to string before returning to host (Clojure)
    return json.dumps(result)

def table_parts(table):
    """
    Extract (catalog, schema, table) 3-tuple from a table expression.
    Returns None if the table doesn't have a valid name (e.g., UDTFs).

    SQLGlot naming:
    - table.catalog → SQL catalog (e.g., BigQuery project, Snowflake database)
    - table.db      → SQL schema (e.g., BigQuery dataset, Postgres schema)
    - table.name    → table name
    """
    name = table.name
    if not isinstance(name, str) or not name:
        # UDTFs and other function-based sources don't have traditional table names
        return None
    return (table.catalog or None, table.db or None, name)

def referenced_tables(sql: str, dialect: str = "postgres") -> str:
    """
    Extract table references from a SQL query.

    Returns a JSON array of [catalog, schema, table] 3-tuples:
    [[null, null, "users"], [null, "public", "orders"], ["myproject", "dataset", "events"]]

    Excludes CTEs, subquery aliases, and UDTFs.

    :param sql: SQL query string
    :param dialect: SQL dialect (postgres, mysql, snowflake, bigquery, redshift, duckdb)

    Examples:
        referenced_tables("SELECT * FROM users")
        => '[[null, null, "users"]]'

        referenced_tables("SELECT * FROM public.users")
        => '[[null, "public", "users"]]'

        referenced_tables("SELECT * FROM myproject.analytics.events", "bigquery")
        => '[["myproject", "analytics", "events"]]'
    """
    ast = sqlglot.parse_one(sql, read=dialect)
    root_scope = optimizer.build_scope(ast)

    tables = set()
    for scope in root_scope.traverse():
        for source in scope.sources.values():
            if isinstance(source, exp.Table):
                parts = table_parts(source)
                if parts is not None:
                    tables.add(parts)

    # Sort for deterministic output (nulls sort first via empty string)
    return json.dumps(sorted(tables, key=lambda x: (x[0] or "", x[1] or "", x[2])))

def validate_sql_query(sql: str, dialect: str = "postgres") -> str:
    """
    Validate a SQL query using sqlglot's parser.

    Returns a JSON object with validation results:
    - If valid: {"valid": true}
    - If invalid: {"valid": false, "errors": [{"message": "...", "line": N, "col": N}, ...]}

    :param sql: SQL query string to validate
    :param dialect: SQL dialect (postgres, mysql, snowflake, bigquery, redshift, duckdb)

    Examples:
        validate_sql_query("SELECT * FROM users")
        => '{"valid": true}'

        validate_sql_query("SELECT * FORM users")
        => '{"valid": false, "errors": [{"message": "...", "line": 1, "col": 10}]}'
    """
    errors = []

    try:
        # Try to parse the SQL
        parsed = sqlglot.parse(sql, read=dialect)

        # Check if parsing returned None or empty list
        if not parsed:
            errors.append({
                "message": "Failed to parse SQL query",
                "line": None,
                "col": None
            })
        else:
            # Check each parsed statement for errors
            for statement in parsed:
                if statement is None:
                    errors.append({
                        "message": "Invalid SQL statement",
                        "line": None,
                        "col": None
                    })
                # Check for parser errors stored in the statement
                elif hasattr(statement, 'errors') and statement.errors:
                    for error in statement.errors:
                        error_dict = {
                            "message": str(error.get('description', error.get('message', str(error)))),
                            "line": error.get('line'),
                            "col": error.get('col')
                        }
                        errors.append(error_dict)

    except ParseError as e:
        # Extract error details from ParseError
        error_msg = str(e)
        # Try to extract line and column info from error message
        line_match = re.search(r'Line (\d+)', error_msg)
        col_match = re.search(r'Col[:\s]+(\d+)', error_msg)

        errors.append({
            "message": error_msg,
            "line": int(line_match.group(1)) if line_match else None,
            "col": int(col_match.group(1)) if col_match else None
        })

    except Exception as e:
        # Catch any other errors
        errors.append({
            "message": f"Unexpected error: {str(e)}",
            "line": None,
            "col": None
        })

    result = {
        "valid": len(errors) == 0,
        "errors": errors if errors else []
    }

    return json.dumps(result)

def referenced_fields(sql: str, dialect: str = "postgres") -> str:
    """
    Extract field references from a SQL query, returning only fields from actual database tables.

    Returns a JSON array of [catalog, schema, table, field] 4-tuples:
    [[null, null, "users", "id"], [null, "public", "orders", "total"]]

    Includes:
    - Wildcards as [catalog, schema, table, "*"]
    - All specific column references

    Excludes:
    - Fields created in CTEs or subqueries
    - Aliases (returns actual table names, not their aliases)
    - Computed/derived columns

    :param sql: SQL query string
    :param dialect: SQL dialect (postgres, mysql, snowflake, bigquery, redshift, duckdb)

    Examples:
        referenced_fields("SELECT id FROM users", "postgres")
        => '[[null, null, "users", "id"]]'

        referenced_fields("SELECT * FROM public.users", "postgres")
        => '[[null, "public", "users", "*"]]'

        referenced_fields("SELECT * FROM myproject.analytics.events", "bigquery")
        => '[["myproject", "analytics", "events", "*"]]'
    """
    ast = sqlglot.parse_one(sql, read=dialect)
    root_scope = optimizer.build_scope(ast)

    fields = set()

    # Collect all CTE names to exclude them
    cte_names = set()
    for cte in ast.find_all(exp.CTE):
        if cte.alias:
            cte_names.add(cte.alias)

    # Track scopes with unqualified wildcards
    unqualified_wildcard_scopes = []

    # Traverse all scopes to find column references
    for scope in root_scope.traverse():
        # Build a mapping of table aliases to table_parts tuples (catalog, schema, table)
        # Only include actual tables, not CTEs or subqueries
        alias_to_table_parts = {}
        for alias, source in scope.sources.items():
            if isinstance(source, exp.Table):
                table_name = source.name
                # Skip if this is actually a CTE reference
                if table_name and table_name not in cte_names and alias not in cte_names:
                    parts = table_parts(source)
                    if parts is not None:
                        alias_to_table_parts[alias] = parts

        # Check for unqualified wildcards (SELECT * without table qualification)
        if isinstance(scope.expression, exp.Select):
            for expr in scope.expression.expressions:
                if isinstance(expr, exp.Star):
                    unqualified_wildcard_scopes.append((scope, alias_to_table_parts))
                    break

        # Find all column references in this scope
        for column in scope.expression.find_all(exp.Column):
            column_name = column.name
            table_ref = column.table

            # Handle qualified wildcards (e.g., "users.*")
            if column_name == "*":
                if table_ref:
                    parts = alias_to_table_parts.get(table_ref)
                    if parts is not None:
                        # 4-tuple: (catalog, schema, table, field)
                        fields.add(parts + ("*",))
                continue

            # Regular column references
            if table_ref:
                parts = alias_to_table_parts.get(table_ref)
                if parts is not None:
                    fields.add(parts + (column_name,))
            else:
                # Column without explicit table qualifier
                # If there's only one source table, use that
                if len(alias_to_table_parts) == 1:
                    parts = list(alias_to_table_parts.values())[0]
                    fields.add(parts + (column_name,))

    # For scopes with unqualified wildcards, add wildcard entries for all tables
    for scope, alias_to_table_parts in unqualified_wildcard_scopes:
        for parts in alias_to_table_parts.values():
            fields.add(parts + ("*",))

    # Sort for deterministic output: catalog, schema, table, field
    return json.dumps(sorted(fields, key=lambda x: (x[0] or "", x[1] or "", x[2], x[3])))

# TODO: signal missing cases failures better?
# TODO: Consider generic way of error extraction. It might make sense to do this in clojure.
def serialize_error(e):

    message = e.args[0]
    assert isinstance(message, str), "Unexpected error format."

    match = re.search(r'^Unknown table:\s*(?P<table>.*)', message)
    if match:
        return {"status": "error",
                "type": "unknown_table",
                "message": match.group(),
                "table": match.group('table')}

    match = re.search(r'''(?P<message>^Column '(?P<column>\S+)' could not be resolved.)(?P<details>.*)''', message)
    if match:
        return {"status": "error",
                "type": "column_not_resolved",
                "message": match.group('message'),
                "column": match.group('column'),
                "details": match.group('details')}

    # ('Invalid expression / Unexpected token. Line 1, Col: 23.\n  complete nonsense \x1b[4mquery\x1b[0m',)
    match = re.search(r'(?P<message>^Invalid expression.*?\.)(?P<details>.*)', message)
    if match:
        return {"status": "error",
                "type": "invalid_expression",
                "message": match.group('message'),
                "details": match.group('details')}

    return {"status": "error",
            "type": "unhandled",
            "message": message}

def validate_query(dialect, sql, default_table_schema, sqlglot_schema_json):
    """
    Validate a SQL query against a schema using sqlglot's qualify optimizer.

    Validation modes:
    - Strict mode (sqlglot_schema provided): Validates columns and tables exist in schema.
      Returns errors for unknown tables, unresolved columns, missing table aliases.
    - Permissive mode (sqlglot_schema is None/empty): Only checks SQL syntax, infers schema
      from query structure. Useful for UDTFs and queries against unknown tables.

    Returns JSON with:
    - If valid: {"status": "ok"}
    - If error: {"status": "error", "type": "...", "message": "...", ...}

    Error types:
    - unknown_table: Table reference not found in schema (strict mode only)
    - column_not_resolved: Column not found (includes 'column' and optionally 'details')
    - invalid_expression: Syntax/parse error
    - unhandled: Other errors

    :param dialect: SQLGlot dialect string (e.g., "postgres", "mysql")
    :param sql: SQL query string to validate
    :param default_table_schema: Default schema for unqualified tables
    :param sqlglot_schema_json: JSON-encoded schema dict {schema: {table: {column: type}}},
                                or None/empty for permissive mode
    """
    status = {"status": "ok"}

    # Decode JSON schema if provided (GraalVM Polyglot passes complex maps as JSON strings)
    sqlglot_schema = json.loads(sqlglot_schema_json) if sqlglot_schema_json else None

    # Determine validation mode based on whether schema is provided
    # - Strict mode: schema provided → validate columns/tables exist
    # - Permissive mode: no schema → only check syntax, infer schema from query
    strict_mode = sqlglot_schema is not None and len(sqlglot_schema) > 0

    try:
        ast = sqlglot.parse_one(sql, read=dialect)
        ast = qualify.qualify(ast,
                            db=default_table_schema,
                            dialect=dialect,
                            schema=sqlglot_schema if strict_mode else None,
                            # In strict mode: don't infer, validate against provided schema
                            # In permissive mode: infer schema from query (handles UDTFs)
                            infer_schema=not strict_mode,
                            # In strict mode: validate that columns can be resolved
                            validate_qualify_columns=strict_mode,
                            sql=sql)
    except ParseError as e:
        status |= serialize_error(e)
    except OptimizeError as e:
        status |= serialize_error(e)

    return json.dumps(status)

#############################################################################
# Experimental (using lineage)
#############################################################################

def is_pure_column(root):
    """
    Check whether the lineage graph is a path of columns terminated by table.

    :param root: The root of the lineage graph
    """
    for node in root.walk():
        expression = node.expression
        downstream = node.downstream

        # We are looking for "path"...
        if len(downstream) > 1:
            return False

        examined = None
        if (isinstance(expression, exp.Alias)):
            examined = expression.this
        else:
            examined = expression

        # ...of `exp.Column`s...
        if isinstance(examined, exp.Column):
            continue
        # ...terminated by the `exp.Table`
        elif isinstance(examined, exp.Table):
            continue
        else:
            return False
    return True

# TODO: infer_schema=True?
# TODO: Comment on everything is aliased?
def simple_query(sql: str, dialect: str = None) -> str:
    """
    Check if SQL is a simple SELECT (no LIMIT, OFFSET, or CTEs).

    Used by Workspaces to determine if automatic checkpoints can be inserted.

    Returns a JSON object with:
    - If simple: {"is_simple": true}
    - If not simple: {"is_simple": false, "reason": "..."}

    :param sql: SQL query string to check
    :param dialect: SQL dialect (postgres, mysql, snowflake, bigquery, etc.)

    Examples:
        simple_query("SELECT * FROM users")
        => '{"is_simple": true}'

        simple_query("SELECT * FROM users LIMIT 10")
        => '{"is_simple": false, "reason": "Contains a LIMIT"}'

        simple_query("WITH cte AS (SELECT 1) SELECT * FROM cte")
        => '{"is_simple": false, "reason": "Contains a CTE"}'
    """
    try:
        ast = sqlglot.parse_one(sql, read=dialect)

        # Must be a SELECT or Query type (CTE queries parse as Select with 'with' arg)
        if not isinstance(ast, (exp.Select, exp.Query)):
            return json.dumps({"is_simple": False, "reason": "Not a simple SELECT"})

        # No CTEs (WITH clause) - SQLGlot uses "with_" (with underscore) as the arg name
        if ast.args.get("with_"):
            return json.dumps({"is_simple": False, "reason": "Contains a CTE"})

        # For non-Select Query types (Union, Intersect, etc.), reject
        if not isinstance(ast, exp.Select):
            return json.dumps({"is_simple": False, "reason": "Not a simple SELECT"})

        # No LIMIT
        if ast.args.get("limit"):
            return json.dumps({"is_simple": False, "reason": "Contains a LIMIT"})

        # No OFFSET
        if ast.args.get("offset"):
            return json.dumps({"is_simple": False, "reason": "Contains an OFFSET"})

        return json.dumps({"is_simple": True})
    except ParseError as e:
        return json.dumps({"is_simple": False, "reason": str(e)})
    except Exception as e:
        return json.dumps({"is_simple": False, "reason": f"Unexpected error: {str(e)}"})

def add_into_clause(sql: str, table_name: str, dialect: str = None) -> str:
    """
    Add an INTO clause to a SELECT statement for SQL Server SELECT INTO syntax.

    Transforms: SELECT * FROM products
    Into:       SELECT * INTO "new_table" FROM products

    Used by SQL Server transforms which require SELECT INTO syntax
    instead of CREATE TABLE AS SELECT.

    :param sql: The SELECT SQL query string
    :param table_name: The target table name (already formatted/quoted)
    :param dialect: SQL dialect (e.g., "tsql" for SQL Server)
    :return: Modified SQL string with INTO clause

    Examples:
        add_into_clause("SELECT * FROM products", '"PRODUCTS_COPY"', "tsql")
        => 'SELECT * INTO "PRODUCTS_COPY" FROM products'
    """
    ast = sqlglot.parse_one(sql, read=dialect)

    if not isinstance(ast, exp.Select):
        raise ValueError("SQL must be a SELECT statement")

    # Create the Into expression with the table identifier
    # The table_name is pre-formatted, so parse it to preserve quotes
    into = exp.Into(this=exp.to_table(table_name))

    # Set the into clause on the select
    ast.set("into", into)

    # Generate SQL in the target dialect
    return ast.sql(dialect=dialect)


def returned_columns_lineage(dialect, sql, default_table_schema, sqlglot_schema_json):
    """
    Extract column lineage from SQL query.

    Args:
        dialect: SQL dialect string (e.g., "postgres", "mysql")
        sql: SQL query string
        default_table_schema: Default schema name (e.g., "public")
        sqlglot_schema_json: JSON-encoded schema map (to avoid GraalVM polyglot issues)

    Returns:
        JSON array of [alias, is_pure, dependencies] tuples
    """
    # Decode schema from JSON (passed from Clojure to avoid polyglot map issues)
    sqlglot_schema = json.loads(sqlglot_schema_json) if sqlglot_schema_json else None

    ast = sqlglot.parse_one(sql, read=dialect)
    ast = qualify.qualify(ast,
                          db=default_table_schema,
                          dialect=dialect,
                          schema=sqlglot_schema,
                          infer_schema=True,
                          sql=sql)

    assert isinstance(ast, exp.Query), "Ast does not represent a `Query`."

    dependencies = []
    for select in ast.named_selects:

        # TODO: Duplicated aliases are not verified. # We have to do it ourselves.
        # TODO: Because they are allowed! How can we handle that?
        assert select not in dependencies, \
            "Duplicate alias `{}`.".format(select)

        select_elm_lineage = lineage.lineage(select, ast.sql(dialect), dialect=dialect)
        is_pure_select = is_pure_column(select_elm_lineage)

        leaves = set()
        for node in select_elm_lineage.walk():
            if (# Leaf nodes of `.walk` are `exp.Table`s. We are interested
                # in the columns selected from those tables (i.e. penultimate
                # level). The condition is intended to examine those columns.
                len(node.downstream) == 1
                and isinstance(node.downstream[0].expression, exp.Table)
                and not node.downstream[0].downstream):
                # For UDTFs/table functions, the penultimate node may not be a Column
                # (e.g., FLATTEN results). Skip these gracefully.
                if not isinstance(node.expression.this, exp.Column):
                    continue
                # TODO: The column is missing table schema because source table
                # is aliased to its name. Maybe there's a cleaner way. Figure that
                # out!
                table = table_parts(node.downstream[0].expression)
                # Skip UDTFs and other function-based sources that don't have real table names
                if table is not None:
                    namespaced_column = table + (node.expression.this.name, )
                    leaves.add(namespaced_column)

        dependencies.append((select, is_pure_select, tuple(leaves), ))

    return json.dumps(dependencies)


def replace_names(sql: str, replacements_json: str, dialect: str = None) -> str:
    """
    Replace schema, table, and column names in a SQL query.

    SECURITY NOTE: Replacement values are injected into the SQL AST without sanitization.
    This is safe because the only caller (workspaces/execute.clj) passes system-generated
    values: isolation schema names (mb__isolation_<slug>_<id>) and table names from
    database metadata. User input never flows into replacement values.

    Args:
        sql: SQL query string
        replacements_json: JSON-encoded map with keys:
            - schemas: {old_schema: new_schema}
            - tables: list of [[{schema?, table}, new_name], ...]
            - columns: list of [[{schema?, table?, column}, new_name], ...]
        dialect: SQL dialect string

    Returns:
        Modified SQL string with replacements applied.

    Examples:
        replace_names("SELECT * FROM people", '{"tables": [[{"table": "people"}, "users"]]}', "postgres")
        => 'SELECT * FROM users'

        replace_names("SELECT id FROM orders", '{"columns": [[{"table": "orders", "column": "id"}, "user_id"]]}')
        => 'SELECT user_id FROM orders'
    """
    replacements = json.loads(replacements_json)
    schemas = replacements.get("schemas") or {}
    tables = replacements.get("tables") or []  # List of [key, value] pairs
    columns = replacements.get("columns") or []  # List of [key, value] pairs

    # Convert list-of-pairs to lookup dicts for O(1) matching
    # Tables: (schema, table) -> new_name
    table_map = {}
    for item in tables:
        key, new_name = item
        schema = key.get("schema")  # may be None
        table = key["table"]
        table_map[(schema, table)] = new_name

    # Columns: (schema, table, column) -> new_name
    column_map = {}
    for item in columns:
        key, new_name = item
        schema = key.get("schema")
        table = key.get("table")  # may be None for unqualified
        column = key["column"]
        column_map[(schema, table, column)] = new_name

    ast = sqlglot.parse_one(sql, read=dialect)

    def rename_fn(node):
        # Schema rename (appears in Table.db)
        if isinstance(node, exp.Table):
            # Capture original values BEFORE any modifications (important for lookup)
            original_schema = node.db
            original_table = node.name
            # Preserve original quoting status for renamed identifiers
            original_schema_quoted = node.args.get("db").quoted if node.args.get("db") else False
            original_table_quoted = node.this.quoted if node.this else False

            # Rename schema if present
            if original_schema and original_schema in schemas:
                node.set("db", exp.Identifier(this=schemas[original_schema], quoted=original_schema_quoted))

            # Rename table - try exact match first (with original schema), then without schema
            new_table = (table_map.get((original_schema, original_table)) or
                         table_map.get((None, original_table)))
            if new_table:
                if isinstance(new_table, dict):
                    # New format: {schema: x, table: y}
                    if new_table.get("schema"):
                        # When injecting a new schema, quote if it contains special characters
                        new_schema = new_table["schema"]
                        schema_quoted = original_schema_quoted or needs_quoting(new_schema)
                        node.set("db", exp.Identifier(this=new_schema, quoted=schema_quoted))
                    if new_table.get("table"):
                        new_table_name = new_table["table"]
                        table_quoted = original_table_quoted or needs_quoting(new_table_name)
                        node.set("this", exp.Identifier(this=new_table_name, quoted=table_quoted))
                else:
                    # String: just the table name
                    table_quoted = original_table_quoted or needs_quoting(new_table)
                    node.set("this", exp.Identifier(this=new_table, quoted=table_quoted))

        # Column rename
        elif isinstance(node, exp.Column):
            col_name = node.name
            col_table = node.table  # May be None if column is unqualified (e.g., "SELECT id" not "SELECT t.id")
            # Preserve original quoting status
            original_col_quoted = node.this.quoted if node.this else False

            # Try to find a matching column rename.
            # The challenge: replacement key might be {:table "orders" :column "id"}
            # but the SQL column ref might just be "id" (unqualified).
            # We need to match flexibly:
            # - Exact match: (schema, table, column) all match
            # - Table match: column and table match, schema is None in key
            # - Column-only match: just column matches (when no table qualifier in SQL)
            new_col = None

            # Iterate through all column mappings and find best match
            for (key_schema, key_table, key_col), new_name in column_map.items():
                if key_col != col_name:
                    continue
                # Column name matches, now check table qualifier
                # Note: SQLGlot uses empty string (not None) for missing table qualifier
                if col_table:
                    # SQL has table qualifier - match if tables are equal
                    if key_table == col_table:
                        new_col = new_name
                        break
                else:
                    # SQL has no table qualifier - accept any table in key
                    # (this is the common case: "SELECT id FROM orders" with key {:table "orders" :column "id"})
                    new_col = new_name
                    break

            if new_col:
                node.set("this", exp.Identifier(this=new_col, quoted=original_col_quoted))

        return node

    transformed = ast.transform(rename_fn)
    return transformed.sql(dialect=dialect)


#############################################################################
# Field References (Macaw-compatible output)
#############################################################################

def field_references(sql: str, dialect: str = "postgres") -> str:
    """
    Extract field references from SQL, returning used and returned fields.

    This is the SQLGlot equivalent of Macaw's field-references function.
    Returns a JSON object with:
    - used_fields: list of field specs from WHERE, JOIN ON, GROUP BY, ORDER BY
    - returned_fields: list of field specs from SELECT clause (ordered)
    - errors: list of validation errors

    Each field spec has:
    - type: single_column, all_columns, custom_field, composite_field, or unknown_columns
    - column: column name (for single_column)
    - alias: column alias (null if none)
    - source_columns: nested list of possible source columns
    - table: table info (for all_columns)
    - used_fields: list of fields used (for custom_field)
    - member_fields: list of fields (for composite_field)
    """
    try:
        ast = sqlglot.parse_one(sql, read=dialect)
    except ParseError:
        return json.dumps({
            "used_fields": [],
            "returned_fields": [],
            "errors": [{"type": "syntax_error"}]
        })

    walker = FieldReferenceWalker(ast, dialect)
    result = walker.walk()

    # Convert sets to lists for JSON serialization
    result["used_fields"] = list(result["used_fields"])
    result["errors"] = list(result["errors"])

    return json.dumps(result, default=_json_default)


def _json_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, frozenset):
        return list(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class FieldReferenceWalker:
    """
    Walks SQLGlot AST to extract field references matching Macaw's output format.

    Key concepts:
    - sources: Nested list of source tables/subqueries. Outer list = scope levels,
               inner list = same-scope sources (FROM + JOINs).
    - withs: Set of CTE definitions, progressively built.
    """

    def __init__(self, ast, dialect):
        self.ast = ast
        self.dialect = dialect

    def walk(self):
        """Main entry point - returns {used_fields, returned_fields, errors}"""
        return self._process_query(self.ast, outside_sources=[], withs={})

    def _process_query(self, expr, outside_sources, withs):
        """Process a query node (SELECT, UNION, etc.)"""
        if isinstance(expr, exp.Select):
            return self._process_select(expr, outside_sources, withs)
        elif isinstance(expr, exp.Union):
            return self._process_union(expr, outside_sources, withs)
        else:
            # Unknown query type
            return {
                "used_fields": set(),
                "returned_fields": [],
                "errors": {self._syntax_error()}
            }

    def _process_select(self, select_expr, outside_sources, withs):
        """Process a SELECT statement."""
        errors = set()  # Set of frozen errors for deduplication

        # Handle CTEs (WITH clause)
        local_withs = dict(withs)
        with_clause = select_expr.args.get("with_")
        if with_clause:
            is_recursive = with_clause.args.get("recursive")
            for cte in with_clause.expressions:
                cte_name = cte.alias
                cte_body = cte.this

                if is_recursive and isinstance(cte_body, exp.Union):
                    # For recursive CTEs with UNION, process the base case first
                    # to get the returned_fields structure, then process the full body.
                    # The base case is the left side of the UNION.
                    base_result = self._process_query(cte_body.left, outside_sources, local_withs)

                    # Now add the CTE to local_withs with the base case's returned_fields
                    # so the recursive part can reference it.
                    # Mark it as the "current CTE" so we can detect self-references.
                    local_withs[cte_name] = {
                        "names": {"table": cte_name, "table_alias": cte_name},
                        "returned_fields": base_result["returned_fields"],
                        "used_fields": base_result["used_fields"],
                        "errors": base_result["errors"],
                        "is_recursive_cte": True  # Marker survives JOIN aliasing
                    }

                    # Process the full CTE body (UNION) with the CTE now available
                    cte_result = self._process_query(cte_body, outside_sources, local_withs)

                    # Keep is_recursive_cte flag in final entry
                    local_withs[cte_name] = {
                        "names": {"table": cte_name},
                        "returned_fields": cte_result["returned_fields"],
                        "used_fields": cte_result["used_fields"],
                        "errors": cte_result["errors"],
                        "is_recursive_cte": True
                    }
                else:
                    # Non-recursive CTE - just process normally
                    cte_result = self._process_query(cte_body, outside_sources, local_withs)

                    local_withs[cte_name] = {
                        "names": {"table": cte_name},
                        "returned_fields": cte_result["returned_fields"],
                        "used_fields": cte_result["used_fields"],
                        "errors": cte_result["errors"]
                    }
                # cte_result["errors"] is a list of dicts, freeze them for set membership
                for e in cte_result["errors"]:
                    errors.add(self._freeze_field(e) if isinstance(e, dict) else e)

        # Build local sources from FROM + JOINs
        local_sources = self._build_sources(select_expr, outside_sources, local_withs)
        combined_sources = [local_sources] + outside_sources

        # Process returned fields (SELECT clause)
        returned_fields = []
        for select_item in select_expr.expressions:
            fields = self._find_returned_fields(select_item, combined_sources, local_withs)
            for field_result in fields:
                if "col" in field_result:
                    returned_fields.append(field_result["col"])
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # Build sources including SELECT aliases for ORDER BY resolution
        # SELECT aliases should be a separate scope level from table sources,
        # so that source_columns properly nests [select_aliases] [table_sources]
        select_source = {
            "names": None,
            "returned_fields": [f for f in returned_fields if f.get("alias")],
            "used_fields": set(),
            "errors": set()
        }
        sources_with_select = [[select_source]] + [local_sources] + outside_sources

        # Process used fields
        used_fields = set()

        # SELECT clause (references in expressions, not the returned columns themselves)
        for select_item in select_expr.expressions:
            for field_result in self._find_used_fields(select_item, combined_sources, local_withs):
                if "col" in field_result:
                    used_fields.add(self._freeze_field(field_result["col"]))
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # WHERE clause (include select aliases for lineage tracking, matching Macaw)
        where = select_expr.args.get("where")
        if where:
            for field_result in self._find_used_fields(where, sources_with_select, local_withs):
                if "col" in field_result:
                    used_fields.add(self._freeze_field(field_result["col"]))
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # JOIN ON conditions (include select aliases for lineage tracking, matching Macaw)
        for join in select_expr.args.get("joins", []):
            on_clause = join.args.get("on")
            if on_clause:
                for field_result in self._find_used_fields(on_clause, sources_with_select, local_withs):
                    if "col" in field_result:
                        used_fields.add(self._freeze_field(field_result["col"]))
                    if "errors" in field_result:
                        errors.update(field_result["errors"])

        # GROUP BY
        group = select_expr.args.get("group")
        if group:
            for field_result in self._find_used_fields(group, sources_with_select, local_withs):
                if "col" in field_result:
                    used_fields.add(self._freeze_field(field_result["col"]))
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # ORDER BY (can reference SELECT aliases)
        order = select_expr.args.get("order")
        if order:
            for field_result in self._find_used_fields(order, sources_with_select, local_withs):
                if "col" in field_result:
                    used_fields.add(self._freeze_field(field_result["col"]))
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # HAVING clause
        having = select_expr.args.get("having")
        if having:
            for field_result in self._find_used_fields(having, sources_with_select, local_withs):
                if "col" in field_result:
                    used_fields.add(self._freeze_field(field_result["col"]))
                if "errors" in field_result:
                    errors.update(field_result["errors"])

        # Include used_fields from local sources (CTEs)
        for source in local_sources:
            for field in source.get("used_fields", set()):
                if isinstance(field, dict):
                    used_fields.add(self._freeze_field(field))
                else:
                    used_fields.add(field)

        # Include used_fields from CTEs
        for cte_source in local_withs.values():
            for field in cte_source.get("used_fields", set()):
                if isinstance(field, dict):
                    used_fields.add(self._freeze_field(field))
                else:
                    used_fields.add(field)

        return {
            "used_fields": [self._unfreeze_field(f) for f in used_fields],
            "returned_fields": returned_fields,
            "errors": [self._unfreeze_field(e) for e in errors]
        }

    def _process_union(self, union_expr, outside_sources, withs):
        """Process UNION/INTERSECT/EXCEPT - creates composite_field for returned columns."""
        left_result = self._process_query(union_expr.left, outside_sources, withs)
        right_result = self._process_query(union_expr.right, outside_sources, withs)

        # Combine used_fields
        used_fields = set()
        for f in left_result["used_fields"]:
            used_fields.add(self._freeze_field(f) if isinstance(f, dict) else f)
        for f in right_result["used_fields"]:
            used_fields.add(self._freeze_field(f) if isinstance(f, dict) else f)

        # Create composite returned_fields
        returned_fields = []
        left_fields = left_result["returned_fields"]
        right_fields = right_result["returned_fields"]

        for i in range(max(len(left_fields), len(right_fields))):
            left_field = left_fields[i] if i < len(left_fields) else None
            right_field = right_fields[i] if i < len(right_fields) else None

            if left_field:
                alias = left_field.get("alias") or left_field.get("column")
            elif right_field:
                alias = right_field.get("alias") or right_field.get("column")
            else:
                alias = None

            member_fields = []
            if left_field:
                member_fields.append(left_field)
            if right_field:
                member_fields.append(right_field)

            returned_fields.append({
                "type": "composite_field",
                "alias": alias,
                "member_fields": member_fields
            })

        all_errors = set()
        for e in left_result["errors"]:
            if isinstance(e, dict):
                all_errors.add(self._freeze_field(e))
            else:
                all_errors.add(e)
        for e in right_result["errors"]:
            if isinstance(e, dict):
                all_errors.add(self._freeze_field(e))
            else:
                all_errors.add(e)

        return {
            "used_fields": [self._unfreeze_field(f) for f in used_fields],
            "returned_fields": returned_fields,
            "errors": [self._unfreeze_field(e) for e in all_errors]
        }

    def _build_sources(self, select_expr, outside_sources, withs):
        """Build source list from FROM clause and JOINs.

        Note: Macaw processes JOINs first, then appends FROM at the end.
        This affects the order when expanding wildcards.
        """
        sources = []

        # Process JOINs first (matching Macaw's order)
        for join in select_expr.args.get("joins", []):
            source = self._process_source(join.this, outside_sources, withs)
            if source:
                sources.append(source)

        # Then append FROM clause at the end
        from_clause = select_expr.args.get("from_")
        if from_clause:
            source = self._process_source(from_clause.this, outside_sources, withs)
            if source:
                sources.append(source)

        return sources

    def _process_source(self, source_expr, outside_sources, withs):
        """Process a source (table, subquery, or CTE reference)."""
        # Check for table functions first (UDTF or any UDTF subclass like GenerateSeries)
        # Note: isinstance checks for subclasses too, so exp.UDTF catches GenerateSeries
        if isinstance(source_expr, exp.UDTF):
            # Table function (GENERATE_SERIES, etc.)
            alias = source_expr.alias
            return {
                "names": {"table_alias": alias} if alias else None,
                "returned_fields": [{"type": "unknown_columns"}],
                "used_fields": set(),
                "errors": set()
            }

        if isinstance(source_expr, exp.Table):
            table_name = source_expr.name
            table_alias = source_expr.alias

            # Check if it's a CTE reference
            if table_name in withs:
                cte_data = withs[table_name]
                cte_table_info = {"table": table_name}
                if table_alias:
                    cte_table_info["table_alias"] = table_alias
                cte_source = dict(cte_data)
                cte_source["names"] = cte_table_info
                return cte_source

            # A table with empty name but an alias might be a table function result
            # that SQLGlot didn't recognize. Treat as unknown_columns.
            if not table_name and table_alias:
                return {
                    "names": {"table_alias": table_alias},
                    "returned_fields": [{"type": "unknown_columns"}],
                    "used_fields": set(),
                    "errors": set()
                }

            # A table with empty name whose 'this' is a function is a table function
            # that SQLGlot parsed as Table instead of UDTF (e.g., my_function(1, 100))
            if not table_name and isinstance(source_expr.this, exp.Func):
                alias = source_expr.alias
                return {
                    "names": {"table_alias": alias} if alias else None,
                    "returned_fields": [{"type": "unknown_columns"}],
                    "used_fields": set(),
                    "errors": set()
                }

            # Real table
            table_info = {"table": table_name}
            if source_expr.db:
                table_info["schema"] = source_expr.db
            if source_expr.catalog:
                table_info["database"] = source_expr.catalog
            if table_alias:
                table_info["table_alias"] = table_alias

            return {
                "names": table_info,
                "returned_fields": [{"type": "all_columns", "table": table_info}],
                "used_fields": set(),
                "errors": set()
            }

        elif isinstance(source_expr, exp.Subquery):
            subquery_result = self._process_query(source_expr.this, outside_sources, withs)
            alias = source_expr.alias
            subquery_result["names"] = {"table_alias": alias} if alias else None
            return subquery_result

        return None

    def _find_returned_fields(self, expr, sources, withs):
        """Find returned fields from a SELECT expression."""
        # Handle aliases
        if isinstance(expr, exp.Alias):
            inner_results = self._find_returned_fields(expr.this, sources, withs)
            alias = expr.alias
            for result in inner_results:
                if "col" in result:
                    result["col"]["alias"] = alias
            return inner_results

        # Unqualified wildcard: SELECT *
        if isinstance(expr, exp.Star):
            results = []
            if sources and sources[0]:
                for source in sources[0]:
                    for field in source.get("returned_fields", []):
                        results.append({"col": field})
            return results

        # Column reference (including table.*)
        if isinstance(expr, exp.Column):
            column_name = expr.name
            table_ref = expr.table

            # Table wildcard: SELECT t.*
            if column_name == "*":
                if table_ref:
                    source = self._find_source({"table": table_ref}, sources)
                    if source:
                        return [{"col": field} for field in source.get("returned_fields", [])]
                    else:
                        return [{"errors": {self._missing_table_alias_error(table_ref)}}]
                return []

            # Regular column
            return self._get_column(sources, expr, return_table_matches=True)

        # Subquery in SELECT
        if isinstance(expr, exp.Subquery):
            subquery_result = self._process_query(expr.this, sources, withs)
            # Single-column subquery returns that column
            if subquery_result["returned_fields"]:
                return [{"col": subquery_result["returned_fields"][0]}]
            return []

        # Everything else is a custom field (function, case, binary expression, etc.)
        used_fields = []
        for result in self._find_used_fields(expr, sources, withs):
            if "col" in result:
                used_fields.append(result["col"])

        alias = expr.alias if hasattr(expr, "alias") and expr.alias else None
        return [{
            "col": {
                "type": "custom_field",
                "alias": alias,
                # Don't freeze - these go directly to returned_fields which isn't unfrozen
                "used_fields": used_fields
            }
        }]

    def _find_used_fields(self, expr, sources, withs):
        """Find fields used in an expression (WHERE, JOIN ON, etc.)."""
        if expr is None:
            return []

        # Column reference
        if isinstance(expr, exp.Column):
            column_name = expr.name
            table_ref = expr.table

            # Table wildcard: t.* - expand to actual fields from source
            if column_name == "*" and table_ref:
                source = self._find_source({"table": table_ref}, sources)
                if source:
                    # Expand wildcard to the actual fields from this source
                    # But skip all_columns and unknown_columns markers -
                    # they don't represent specific used columns
                    results = []
                    for field in source.get("returned_fields", []):
                        ftype = field.get("type")
                        if ftype not in ("all_columns", "unknown_columns"):
                            results.append({"col": field})
                    return results
                # Bad table ref - return empty, error is tracked in _find_returned_fields
                # Don't create a column entry for "*"
                return []

            return self._get_column(sources, expr, return_table_matches=False)

        # Star/wildcard - no used fields
        if isinstance(expr, exp.Star):
            return []

        # Subquery
        if isinstance(expr, exp.Subquery):
            subquery_result = self._process_query(expr.this, sources, withs)
            results = []
            for field in subquery_result["used_fields"]:
                results.append({"col": field})
            return results

        # SELECT in expression context
        if isinstance(expr, exp.Select):
            select_result = self._process_query(expr, sources, withs)
            results = []
            for field in select_result["used_fields"]:
                results.append({"col": field})
            return results

        # Alias - recurse into the aliased expression
        # Only propagate alias if the Alias directly wraps a Column.
        # For complex expressions (functions, etc.), the alias belongs to the
        # expression result, not to the columns used inside.
        if isinstance(expr, exp.Alias):
            results = self._find_used_fields(expr.this, sources, withs)
            # Only add alias if this Alias directly wraps a Column
            if isinstance(expr.this, exp.Column):
                alias = expr.alias
                for result in results:
                    if "col" in result:
                        result["col"]["alias"] = alias
            return results

        # Binary expressions (AND, OR, =, <, >, etc.)
        if isinstance(expr, exp.Binary):
            left = self._find_used_fields(expr.left, sources, withs)
            right = self._find_used_fields(expr.right, sources, withs)
            return left + right

        # Unary expressions (NOT, -, etc.)
        if isinstance(expr, exp.Unary):
            return self._find_used_fields(expr.this, sources, withs)

        # CASE expression
        if isinstance(expr, exp.Case):
            results = []
            # CASE <expr> WHEN...
            if expr.this:
                results.extend(self._find_used_fields(expr.this, sources, withs))
            # WHEN conditions and THEN values
            for ifs in expr.args.get("ifs", []):
                results.extend(self._find_used_fields(ifs.this, sources, withs))
                results.extend(self._find_used_fields(ifs.args.get("true"), sources, withs))
            # ELSE
            if expr.args.get("default"):
                results.extend(self._find_used_fields(expr.args["default"], sources, withs))
            return results

        # BETWEEN
        if isinstance(expr, exp.Between):
            results = []
            results.extend(self._find_used_fields(expr.this, sources, withs))
            results.extend(self._find_used_fields(expr.args.get("low"), sources, withs))
            results.extend(self._find_used_fields(expr.args.get("high"), sources, withs))
            return results

        # IS NULL / IS NOT NULL
        if isinstance(expr, (exp.Is,)):
            return self._find_used_fields(expr.this, sources, withs)

        # IN expression
        if isinstance(expr, exp.In):
            results = self._find_used_fields(expr.this, sources, withs)
            for item in expr.expressions:
                results.extend(self._find_used_fields(item, sources, withs))
            return results

        # EXISTS
        if isinstance(expr, exp.Exists):
            return self._find_used_fields(expr.this, sources, withs)

        # Functions
        if isinstance(expr, exp.Func):
            results = []
            for arg in expr.args.values():
                if isinstance(arg, list):
                    for item in arg:
                        results.extend(self._find_used_fields(item, sources, withs))
                elif isinstance(arg, exp.Expression):
                    results.extend(self._find_used_fields(arg, sources, withs))
            return results

        # Window functions
        if isinstance(expr, exp.Window):
            results = []
            results.extend(self._find_used_fields(expr.this, sources, withs))
            # PARTITION BY
            partition = expr.args.get("partition_by")
            if partition:
                for part in partition:
                    results.extend(self._find_used_fields(part, sources, withs))
            # ORDER BY within window
            order = expr.args.get("order")
            if order:
                results.extend(self._find_used_fields(order, sources, withs))
            return results

        # ORDER BY clause
        if isinstance(expr, exp.Order):
            results = []
            for ordered in expr.expressions:
                results.extend(self._find_used_fields(ordered.this, sources, withs))
            return results

        # GROUP BY clause
        if isinstance(expr, exp.Group):
            results = []
            for item in expr.expressions:
                results.extend(self._find_used_fields(item, sources, withs))
            return results

        # Ordered (for ORDER BY items)
        if isinstance(expr, exp.Ordered):
            return self._find_used_fields(expr.this, sources, withs)

        # Cast
        if isinstance(expr, exp.Cast):
            return self._find_used_fields(expr.this, sources, withs)

        # Paren (parenthesized expression)
        if isinstance(expr, exp.Paren):
            return self._find_used_fields(expr.this, sources, withs)

        # Interval, Literal, etc. - no columns
        if isinstance(expr, (exp.Literal, exp.Interval, exp.DataType, exp.Boolean)):
            return []

        # Identifier (column name without table) - treat as column
        if isinstance(expr, exp.Identifier):
            # Create a fake column to reuse column resolution
            fake_col = exp.Column(this=expr)
            return self._get_column(sources, fake_col, return_table_matches=False)

        # Fallback: try to walk children
        results = []
        for child in expr.iter_expressions():
            results.extend(self._find_used_fields(child, sources, withs))
        return results

    def _get_column(self, sources, column_expr, return_table_matches):
        """Get column reference with source resolution."""
        column_name = column_expr.name
        table_ref = column_expr.table

        # Find valid sources
        if table_ref:
            source = self._find_source({"table": table_ref}, sources)
            valid_sources = [[source]] if source else [[]]
        else:
            valid_sources = sources

        # Build source_columns (nested list of possible sources)
        # Pass through returned_fields from all sources (matching Macaw behavior).
        # This preserves lineage back to original tables through CTEs/subqueries.
        source_columns = []
        for scope_sources in valid_sources:
            if isinstance(scope_sources, list):
                scope_fields = []
                for source in scope_sources:
                    if source and self._source_might_have_column(source, column_name, table_ref):
                        returned_fields = source.get("returned_fields", [])
                        scope_fields.extend(returned_fields)
                if scope_fields:
                    source_columns.append(scope_fields)

        # Check for direct column match in source_columns (matching Macaw)
        # Search in (first source_columns), not in the raw returned_fields
        source_column = None
        if source_columns:
            for field in source_columns[0]:
                field_name = field.get("alias") or field.get("column")
                if field_name and field_name.lower() == column_name.lower():
                    source_column = field
                    break

        # Check for table alias match (SELECT o FROM (SELECT * FROM orders) AS o)
        if not source_column and not table_ref:
            for scope_sources in valid_sources:
                if isinstance(scope_sources, list):
                    for source in scope_sources:
                        if source:
                            names = source.get("names", {})
                            table_alias = names.get("table_alias") if names else None
                            table_name = names.get("table") if names else None
                            if table_alias and table_alias.lower() == column_name.lower():
                                if return_table_matches:
                                    return [{
                                        "col": {
                                            "type": "custom_field",
                                            "alias": column_name,
                                            # Don't freeze - goes directly to returned_fields
                                            "used_fields": list(source.get("returned_fields", []))
                                        }
                                    }]
                                else:
                                    # Table alias match but not returning table matches - empty result
                                    return []
                            if table_name and table_name.lower() == column_name.lower():
                                if return_table_matches:
                                    return [{
                                        "col": {
                                            "type": "custom_field",
                                            "alias": column_name,
                                            # Don't freeze - goes directly to returned_fields
                                            "used_fields": list(source.get("returned_fields", []))
                                        }
                                    }]
                                else:
                                    # Table name match but not returning table matches - empty result
                                    return []

        # Direct column match handling
        # The source_columns in single_column entries already point to the correct source.
        # For custom_field (computed columns like "0 AS level"), we need to create a
        # single_column reference pointing to the source (e.g., the CTE).
        if source_column:
            col_type = source_column.get("type")
            if col_type == "single_column":
                # For recursive CTE self-references (like h.id in recursive CTE),
                # create a CTE reference. For non-recursive CTEs, pass through the
                # matched column (which already has correct source_columns).
                if table_ref and not return_table_matches:
                    source = self._find_source({"table": table_ref}, valid_sources)
                    # Only create CTE reference for RECURSIVE CTEs
                    if source and source.get("is_recursive_cte"):
                        names = source.get("names") or {}
                        table_info = {"table": names.get("table", table_ref)}
                        if names.get("table_alias"):
                            table_info["table_alias"] = names["table_alias"]
                        return [{
                            "col": {
                                "type": "single_column",
                                "column": column_name,
                                "alias": None,
                                "source_columns": [[{"type": "all_columns", "table": table_info}]]
                            }
                        }]
                # For non-recursive CTEs and other cases: pass through matched column
                result_col = dict(source_column)
                # For unqualified reference with multiple scopes: use multi-level source_columns
                if not table_ref and len(source_columns) > 1:
                    result_col["source_columns"] = source_columns
                return [{"col": result_col}]
            elif col_type == "custom_field":
                # Custom field has no source_columns (it's a computed expression).
                # For recursive CTE self-references (like h.level in recursive CTE):
                #   Create single_column with CTE reference
                # For other CTE references (like m.month referencing non-recursive CTE):
                #   Pass through custom_field to preserve structure
                #
                # Detection: is_recursive_cte flag is set during CTE processing
                if table_ref:
                    source = self._find_source({"table": table_ref}, valid_sources)
                    if source and source.get("is_recursive_cte"):
                        names = source.get("names") or {}
                        table_info = {"table": names.get("table", table_ref)}
                        if names.get("table_alias"):
                            table_info["table_alias"] = names["table_alias"]
                        source_ref = [[{"type": "all_columns", "table": table_info}]]
                        return [{
                            "col": {
                                "type": "single_column",
                                "column": column_name,
                                "alias": None,
                                "source_columns": source_ref
                            }
                        }]
                # Return custom_field as-is to preserve structure
                return [{"col": source_column}]
            # For composite_field, etc.: return as-is to preserve structure
            else:
                return [{"col": source_column}]

        # No direct match - return single_column with source_columns
        errors = set()
        if not source_columns or not any(source_columns):
            # No potential sources found
            if table_ref:
                # Table qualifier doesn't exist - return error only, no col spec
                # (Returning a col with empty source_columns would cause Clojure's
                # resolve-field to generate a redundant missing-column error)
                return [{"errors": {self._missing_table_alias_error(table_ref)}}]
            else:
                errors.add(self._missing_column_error(column_name))

        return [{
            "col": {
                "type": "single_column",
                "column": column_name,
                "alias": None,
                "source_columns": source_columns
            },
            "errors": errors
        }]

    def _find_source(self, search, sources):
        """Find a source matching the search criteria."""
        for scope_sources in sources:
            if isinstance(scope_sources, list):
                for source in scope_sources:
                    if source and self._table_matches(search, source.get("names", {})):
                        return source
        return None

    def _table_matches(self, search, table_names):
        """Check if search criteria match table names."""
        if not table_names:
            return False
        search_table = search.get("table")
        search_schema = search.get("schema")
        search_database = search.get("database")

        # Match by alias first (if no schema/database in search)
        if search_table and not search_schema and not search_database:
            if table_names.get("table_alias") == search_table:
                return True

        # Match by table/schema/database
        if search_table and search_table != table_names.get("table"):
            return False
        if search_schema and search_schema != table_names.get("schema"):
            return False
        if search_database and search_database != table_names.get("database"):
            return False

        return search_table == table_names.get("table")

    def _source_might_have_column(self, source, column_name, table_ref):
        """Check if a source might contain a column."""
        if not source:
            return False

        # If table ref specified, check if it matches (case-insensitive since
        # SQLGlot may lowercase identifiers)
        if table_ref:
            names = source.get("names", {})
            if names:
                table_alias = names.get("table_alias")
                table_name = names.get("table")
                if table_alias and table_alias.lower() == table_ref.lower():
                    return True
                if table_name and table_name.lower() == table_ref.lower():
                    return True
            return False

        # No table ref - source might have column
        return True

    def _freeze_field(self, field):
        """Convert a field dict to a hashable frozenset for use in sets."""
        if field is None:
            return None
        if isinstance(field, (str, int, float, bool)):
            return field
        if isinstance(field, frozenset):
            return field
        if isinstance(field, set):
            return frozenset(self._freeze_field(item) for item in field)
        if isinstance(field, (list, tuple)):
            return tuple(self._freeze_field(item) for item in field)
        if isinstance(field, dict):
            items = []
            for k, v in field.items():
                items.append((k, self._freeze_field(v)))
            return frozenset(items)
        return field

    def _unfreeze_field(self, frozen):
        """Convert a frozen field back to a dict."""
        if frozen is None:
            return None
        if isinstance(frozen, (str, int, float, bool)):
            return frozen

        # frozenset of tuples -> dict
        if isinstance(frozen, frozenset):
            # Check if it looks like a dict (frozenset of 2-tuples)
            try:
                items = list(frozen)
                if items and all(isinstance(item, tuple) and len(item) == 2 for item in items):
                    # It's a frozen dict
                    result = {}
                    for k, v in items:
                        result[k] = self._unfreeze_field(v)
                    return result
                else:
                    # It's a frozen set of items
                    return [self._unfreeze_field(item) for item in frozen]
            except:
                return [self._unfreeze_field(item) for item in frozen]

        # tuple -> list
        if isinstance(frozen, tuple):
            return [self._unfreeze_field(item) for item in frozen]

        # list -> list (recursively unfreeze items)
        if isinstance(frozen, list):
            return [self._unfreeze_field(item) for item in frozen]

        # dict -> dict (recursively unfreeze values)
        if isinstance(frozen, dict):
            return {k: self._unfreeze_field(v) for k, v in frozen.items()}

        return frozen

    def _syntax_error(self):
        """Create a syntax error."""
        return frozenset([("type", "syntax_error")])

    def _missing_table_alias_error(self, table_name):
        """Create a missing table alias error."""
        return frozenset([("type", "missing_table_alias"), ("table", table_name)])

    def _missing_column_error(self, column_name):
        """Create a missing column error."""
        return frozenset([("type", "missing_column"), ("column", column_name)])
