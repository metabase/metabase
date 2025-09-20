import { type ExportSpecifier, type Node, Project, SyntaxKind } from "ts-morph";

export type ComponentDefinition = {
  mainComponent: string;
};

export function getPublicComponents() {
  const project = new Project();
  const sdkPublicIndexSourceFile = project.addSourceFileAtPath(
    "enterprise/frontend/src/embedding-sdk-package/index.ts",
  );
  project.addSourceFilesAtPaths(
    "enterprise/frontend/src/embedding-sdk-package/components/public/**/*{.ts,.tsx}",
  );

  const componentForNextJsCompatList: ComponentDefinition[] = [];

  sdkPublicIndexSourceFile.forEachDescendant((node) => {
    switch (node.getKind()) {
      case SyntaxKind.ExportSpecifier: {
        if (!isType(node as ExportSpecifier) && isReactComponent(node)) {
          const componentForNextJsCompat: ComponentDefinition = {
            mainComponent: node.getText(),
          };
          componentForNextJsCompatList.push(componentForNextJsCompat);
        }
        break;
      }
    }
  });

  return componentForNextJsCompatList;
}

function isReactComponent(node: Node) {
  return node.getText().match(/^[A-Z]/);
}

/**
 *
 * @returns {boolean} Whether the export node is a type
 * e.g. `export type { Foo } from './Foo'` or `export { type Foo } from './Foo'`
 */
function isType(node: ExportSpecifier) {
  return node.isTypeOnly() || node.getParent()?.getParent().isTypeOnly();
}
