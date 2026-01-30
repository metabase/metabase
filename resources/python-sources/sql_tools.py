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
    Extract (schema, name) tuple from a table expression.
    Returns None if the table doesn't have a valid name (e.g., UDTFs).
    """
    # table.db maps to what is known as table schema
    name = table.name
    if not isinstance(name, str) or not name:
        # UDTFs and other function-based sources don't have traditional table names
        return None
    return (table.db or None, name)

def referenced_tables(sql: str, dialect: str = "postgres") -> str:
    """
    Extract table references from a SQL query.

    Returns a JSON array of [schema_or_null, table_name] pairs:
    [[null, "users"], ["public", "orders"]]

    Excludes CTEs, subquery aliases, and UDTFs.

    :param sql: SQL query string
    :param dialect: SQL dialect (postgres, mysql, snowflake, bigquery, redshift, duckdb)

    Examples:
        referenced_tables("SELECT * FROM users")
        => '[[null, "users"]]'

        referenced_tables("SELECT * FROM public.users u1 LEFT JOIN other.users u2 ON ...")
        => '[["other", "users"], ["public", "users"]]'
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
    return json.dumps(sorted(tables, key=lambda x: (x[0] or "", x[1])))

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
