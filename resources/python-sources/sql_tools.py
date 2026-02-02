import json
import re

import sqlglot
import sqlglot.lineage as lineage
import sqlglot.optimizer as optimizer
import sqlglot.optimizer.qualify as qualify
from sqlglot import exp
from sqlglot.errors import ParseError, OptimizeError

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

# TODO: get rid of sqlglot_schema
def validate_query(dialect, sql, default_table_schema, sqlglot_schema):
    """
    Docstring for validate_query_stub

    :param dialect: Description
    :param sql: Description
    :param default_table_schema: Description
    :param sqlglot_schema: Description
    """
    print(sql)
    status = {"status": "ok"}
    # TODO: divide into 2 chunks -- parse, optimize
    try:
        ast = sqlglot.parse_one(sql, read=dialect)
        ast = qualify.qualify(ast,
                            db=default_table_schema,
                            dialect=dialect,
                            schema=sqlglot_schema,
                            # TODO: Following makes the UDTFs parse. Broader implications?
                            infer_schema=True,
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
def returned_columns_lineage(dialect, sql, default_table_schema, sqlglot_schema):
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
