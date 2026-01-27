import json
import sqlglot
import sqlglot.optimizer as optimizer
import sqlglot.optimizer.qualify as qualify

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
    parts = (table.catalog or None, table.db or None, table.name or None)
    assert isinstance(parts[2], str), "Missing table name."
    return parts

# TODO: Make catalog and db optional
# TODO: Add type info
def referenced_tables(dialect, sql, catalog, db):
    """
    Return referenced tables.

    :param dialect: dialect to use for parsing
    :param sql: sql string
    :param catalog: Name of the database query runs on
    :param db: In Metabase jargon, default schema for tables without namespace

    Most reliable way I've found to exclude all table like entities that are
    presented as `exp.Table` is `Scope` traversal, selecting its `.sources`.
    Other entities are presented as `Scope` in the `.sources`, so those
    can be exluded easily.
    """
    ast = sqlglot.parse_one(sql, read=dialect)
    ast = qualify.qualify(ast,
                          catalog=catalog,
                          db=db,
                          dialect=dialect,
                          sql=sql)
    root_scope = optimizer.build_scope(ast)

    tables = set()
    for scope in root_scope.traverse():
        tables |= {table_parts(t) for t in scope.sources.values() if isinstance(t, exp.Table)}

    return json.dumps(tuple(tables))
