import type {
  PythonTransformTableAliases,
  Table,
  TableId,
} from "metabase-types/api";

export function updateTransformSignature(
  script: string,
  tables: PythonTransformTableAliases,
  tableInfo: Table[],
): string {
  const tableAliases = Object.keys(tables);

  const transformRegex = /^def\s+transform\s*\([^)]*\)\s*:\s*\n(\s*)/m;

  const signatureOneLine = `def transform(${tableAliases.join(", ")}):`;
  const newSignature =
    signatureOneLine.length > 80 && tableAliases.length > 0
      ? `def transform(\n${tableAliases.map((alias) => `    ${alias}`).join(",\n")},\n):`
      : signatureOneLine;

  function getTableName(tableId: TableId) {
    const table = tableInfo.find((t) => t.id === tableId);
    if (!table) {
      return undefined;
    }
    return [table.db?.name, table.schema, table.name].filter(Boolean).join(".");
  }

  if (transformRegex.test(script)) {
    // Capture the existing indentation after the colon
    const match = script.match(transformRegex);
    const originalIndent = match ? match[1] : "    ";

    let updatedScript = script.replace(
      transformRegex,
      newSignature + "\n" + originalIndent,
    );

    const argsRegex =
      /(\s+"""[\s\S]*?)\s*Args:\s*\n([\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
    const argsMatch = updatedScript.match(argsRegex);

    if (tableAliases.length > 0) {
      const maxAliasLength = Math.max(...tableAliases.map((a) => a.length));
      const newArgsSection = tableAliases
        .map((alias) => {
          const padding = " ".repeat(maxAliasLength - alias.length);
          const tableId = tables[alias];
          const tableName = getTableName(tableId);
          return `        ${alias}:${padding} DataFrame containing the data from the "${tableName}" table`;
        })
        .join("\n");

      if (argsMatch) {
        // Replace existing Args section
        updatedScript = updatedScript.replace(
          argsRegex,
          `    $1

    Args:
${newArgsSection}
$3`,
        );
      } else {
        // No Args section exists, look for the pattern before Returns and insert Args
        // Also remove the instructional text about selecting tables
        const insertRegex =
          /(\s+"""[\s\S]*?)\s*Select tables above to add them as function parameters\.\s*(\n\s+Returns:|\n\s+""")/;
        const insertMatch = updatedScript.match(insertRegex);
        if (insertMatch) {
          updatedScript = updatedScript.replace(
            insertRegex,
            `$1

    Args:
${newArgsSection}
$2`,
          );
        } else {
          // Fallback: just look for Returns section without the specific text
          // Remove any extra whitespace before Returns and ensure single blank line
          const fallbackRegex = /(\s+"""[\s\S]*?)\s*(\n\s+Returns:|\n\s+""")/;
          const fallbackMatch = updatedScript.match(fallbackRegex);
          if (fallbackMatch) {
            updatedScript = updatedScript.replace(
              fallbackRegex,
              `$1

    Args:
${newArgsSection}
$2`,
            );
          }
        }
      }
    } else if (argsMatch) {
      // Remove existing Args section when no tables
      updatedScript = updatedScript.replace(argsRegex, "$1$3");
    }

    return updatedScript;
  }

  const maxAliasLength =
    tableAliases.length > 0
      ? Math.max(...tableAliases.map((a) => a.length))
      : 0;
  const functionTemplate = `
${newSignature}
    """
    Transform function that processes the input data.
    ${
      tableAliases.length > 0
        ? `

    Args:
${tableAliases
  .map((alias) => {
    const padding = " ".repeat(maxAliasLength - alias.length);
    const tableId = tables[alias];
    const tableName = getTableName(tableId);
    if (alias === tableName) {
      return `        ${alias}:${padding} DataFrame containing the data from the corresponding table`;
    }
    return `        ${alias}:${padding} DataFrame containing the data from table "${tableName}"`;
  })
  .join("\n")}`
        : ""
    }

    Returns:
        DataFrame: The transformed data
    """
    import pandas as pd
    return pd.DataFrame()
`;

  return script + functionTemplate;
}
