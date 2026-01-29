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
    # table.db maps to what is known as table schema
    parts = (table.db or None, table.name or None)
    assert isinstance(parts[1], str), "Missing table name."
    return parts

# TODO: Add type info
def referenced_tables(dialect, sql, default_table_schema):
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
                          db=default_table_schema,
                          dialect=dialect,
                          sql=sql)
    root_scope = optimizer.build_scope(ast)

    tables = set()
    for scope in root_scope.traverse():
        tables |= {table_parts(t) for t in scope.sources.values() if isinstance(t, exp.Table)}

    return json.dumps(tuple(tables))

# TODO: Double check when settled.
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
                          sql=sql)

    assert isinstance(ast, exp.Query), "Ast does not represent a `Query`."

    dependencies = []
    for select in ast.named_selects:

        # TODO: Duplicated aliases are not verified. # We have to do it ourselves.
        # TODO: Because they are allowed! How can we handle that?
        assert select not in dependencies, \
            "Duplicate alias `{}`.".format(select)

        select_elm_lineage = lineage.lineage(select, ast.sql(dialect))
        is_pure_select = is_pure_column(select_elm_lineage)

        leaves = set()
        for node in select_elm_lineage.walk():
            if (# Leaf nodes of `.walk` are `exp.Table`s. We are interested
                # in the columns selected from those tables (i.e. penultimate
                # level). The condition is intended to examine those columns.
                len(node.downstream) == 1
                and isinstance(node.downstream[0].expression, exp.Table)
                and not node.downstream[0].downstream):
                assert isinstance(node.expression.this, exp.Column), "Leaf node is not a `Column`."
                # TODO: The column is missing table schema because source table
                # is aliased to its name. Maybe there's a cleaner way. Figure that
                # out!
                table = table_parts(node.downstream[0].expression)
                namespaced_column = table + (node.expression.this.name, )
                leaves.add(namespaced_column)

        dependencies.append((select, is_pure_select, tuple(leaves), ))

    return json.dumps(dependencies)

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
