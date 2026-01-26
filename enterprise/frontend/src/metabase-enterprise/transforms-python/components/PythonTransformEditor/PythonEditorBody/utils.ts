import type { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

export function insertImport(source: string, path: string) {
  const lines = source.split("\n");

  // Find the first line that is not a comment
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) {
      continue;
    }
    lines.splice(i, 0, `import ${pathToImportSpecifier(path)}`);
    break;
  }

  return lines.join("\n");
}

function pathToImportSpecifier(path: string) {
  return path.replace(/\.py$/, "").split("/").join(".");
}

function libImportRegex(path: string) {
  return new RegExp(`import ${pathToImportSpecifier(path)}`, "g");
}

export function removeImport(source: string, path: string) {
  const lines = source.split("\n");
  return lines.filter((line) => !libImportRegex(path).test(line)).join("\n");
}

export function hasImport(source: string, path: string) {
  const regex = libImportRegex(path);
  return regex.test(source);
}

export const createPythonImportTokenLocator =
  (moduleName: string) =>
  (view: EditorView, node: SyntaxNodeRef): boolean => {
    if (node.type.name !== "VariableName") {
      return false;
    }
    const variableName = view.state.doc.sliceString(node.from, node.to);
    if (variableName !== moduleName) {
      return false;
    }
    let cur: SyntaxNodeRef | null = node;
    while (cur) {
      if (cur.type.name === "ImportStatement") {
        return true;
      }
      cur = cur.node.parent;
    }
    return false;
  };
