import json
import sqlglot
from sqlglot import exp

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
