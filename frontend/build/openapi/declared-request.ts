import ts from "typescript";

import { member, propertyType } from "./typescript-utils";

export interface DeclaredRequest {
  method: string;
  url: { path: string };
  parts: ts.Type;
  extraOptions: ts.Expression | undefined;
}

/** Read defineRequest's inferred contract, without interpreting its callback. */
export function resolveDeclaredRequest(
  checker: ts.TypeChecker,
  config: ts.ObjectLiteralExpression,
): DeclaredRequest | undefined {
  const query = member(config, "query");
  if (!query) {
    return;
  }
  const contract = propertyType(
    checker,
    checker.getTypeAtLocation(query),
    "apiContract",
    query,
  );
  if (!contract) {
    return;
  }
  const method = propertyType(checker, contract, "method", query);
  const route = propertyType(checker, contract, "route", query);
  const request = propertyType(checker, contract, "request", query);
  const signatures = request?.getCallSignatures();
  if (
    !method?.isStringLiteral() ||
    !route?.isStringLiteral() ||
    signatures?.length !== 1
  ) {
    return;
  }
  const extraOptions = member(config, "extraOptions");
  return {
    method: method.value,
    url: { path: route.value },
    parts: checker.getReturnTypeOfSignature(signatures[0]),
    extraOptions:
      extraOptions && ts.isPropertyAssignment(extraOptions)
        ? extraOptions.initializer
        : extraOptions && ts.isShorthandPropertyAssignment(extraOptions)
          ? extraOptions.name
          : undefined,
  };
}
