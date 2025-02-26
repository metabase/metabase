import {
  type ExportSpecifier,
  type Identifier,
  type Node,
  Project,
  SyntaxKind,
} from "ts-morph";

import { isNotNull } from "metabase/lib/types";

import type { ComponentDefinition } from "./generate-nextjs-compat";

export function getPublicComponents() {
  const project = new Project();
  const sdkPublicIndexSourceFile = project.addSourceFileAtPath(
    "enterprise/frontend/src/embedding-sdk/components/public/index.ts",
  );
  project.addSourceFilesAtPaths(
    "enterprise/frontend/src/embedding-sdk/components/public/**/*{.ts,.tsx}",
  );

  const componentForNextJsCompatList: ComponentDefinition[] = [];

  sdkPublicIndexSourceFile.forEachDescendant(node => {
    switch (node.getKind()) {
      case SyntaxKind.ExportSpecifier: {
        if (!isType(node as ExportSpecifier) && isReactComponent(node)) {
          const componentForNextJsCompat: ComponentDefinition = {
            mainComponent: node.getText(),
            subComponents: [],
          };
          componentForNextJsCompatList.push(componentForNextJsCompat);

          componentForNextJsCompat.subComponents = findSubComponents(
            node as ExportSpecifier,
          );
        }
        break;
      }
    }
  });

  return componentForNextJsCompatList;
}

function findSubComponents(node: ExportSpecifier) {
  const sdkComponentReferences = (
    node.getFirstChild() as Identifier
  ).findReferencesAsNodes();

  return sdkComponentReferences
    .map(reference => {
      if (
        // Find all `InteractiveQuestion.Xxx` references.
        reference.getParent()?.getKind() ===
          SyntaxKind.PropertyAccessExpression &&
        // Don't include `<InteractiveQuestion.Filter />` in a reference, since they're duplicates.
        !isJsxElement(reference.getParent()?.getParent())
      ) {
        /**
         * [     reference    ]            -> Identifier
         * [     reference.parent       ]  -> PropertyAccessExpression
         *                     [lastChild] -> Identifier
         * InteractiveQuestion.BackButton = BackButton;
         */
        const subComponent = reference.getParent()?.getLastChild()?.getText();
        return subComponent;
      }
    })
    .filter(isNotNull);
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

function isJsxElement(node?: Node) {
  if (!node) {
    return false;
  }

  return [
    SyntaxKind.JsxSelfClosingElement,
    SyntaxKind.JsxOpeningElement,
    SyntaxKind.JsxClosingElement,
  ].includes(node.getKind());
}
