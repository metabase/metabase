import {
  type ExportSpecifier,
  type Identifier,
  type Node,
  Project,
  SyntaxKind,
} from "ts-morph";

import type { ComponentDefinition } from "./generate-nextjs-compat";

export function getPublicComponents() {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(
    "enterprise/frontend/src/embedding-sdk/components/public/index.ts",
  );
  project.addSourceFilesAtPaths(
    "enterprise/frontend/src/embedding-sdk/components/public/**/*{.ts,.tsx}",
  );

  const components: ComponentDefinition[] = [];

  sourceFile.forEachDescendant(node => {
    switch (node.getKind()) {
      case SyntaxKind.ExportSpecifier: {
        if (!isType(node as ExportSpecifier) && isReactComponent(node)) {
          const component: ComponentDefinition = {
            mainComponent: node.getText(),
            subComponents: [],
          };
          components.push(component);

          const references = (
            node.getFirstChild() as Identifier
          ).findReferencesAsNodes();
          references.forEach(reference => {
            if (
              reference.getParent()?.getKind() ===
                SyntaxKind.PropertyAccessExpression &&
              !isJsxElement(reference.getParent()?.getParent())
            ) {
              const subComponent = reference
                .getParent()
                ?.getLastChild()
                ?.getText();
              component.subComponents.push(subComponent as string);
            }
          });
        }
        break;
      }
    }
  });
  return components;
}

function isReactComponent(node: Node) {
  return node.getText().match(/^[A-Z]/);
}

function isType(node: ExportSpecifier) {
  return node.isTypeOnly() || node.getParent()?.getParent().isTypeOnly();
}

function isJsxElement(node?: Node) {
  if (!node) {
    return false;
  }
  const kind = node.getKind();
  return kind >= SyntaxKind.JsxElement && kind <= SyntaxKind.JsxClosingFragment;
}
