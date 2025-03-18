import { t } from "ttag";

import type { Node } from "./pratt";
import type { ErrorWithMessage } from "./types";

/*
 * This class helps anything that handles parser errors to use instanceof to
 * easily distinguish between compilation error exceptions and exceptions due to
 * bugs
 */
abstract class ExpressionError extends Error {
  abstract get pos(): number | null;
  abstract get len(): number | null;
  abstract get friendly(): boolean;
}

export class CompileError extends ExpressionError {
  constructor(
    message: string,
    private data: any,
  ) {
    super(message);
  }

  get friendly(): boolean {
    return true;
  }

  get pos(): number | null {
    return this.data?.token?.pos ?? null;
  }

  get len(): number | null {
    return this.data?.token?.len ?? null;
  }
}

export class ResolverError extends ExpressionError {
  constructor(
    message: string,
    private node?: Node,
  ) {
    super(message);
  }

  get friendly(): boolean {
    return true;
  }

  get pos(): number | null {
    return this.node?.token?.pos ?? null;
  }

  get len(): number | null {
    return this.node?.token?.length ?? null;
  }
}

export class DiagnosticError extends ExpressionError {
  pos: number | null;
  len: number | null;

  constructor(
    message: string,
    {
      pos = null,
      len = null,
    }: { pos?: number | null; len?: number | null } = {},
  ) {
    super(message);
    this.pos = pos;
    this.len = len;
  }

  get friendly(): boolean {
    return true;
  }
}

export function isErrorWithMessage(
  err: unknown,
): err is ErrorWithMessage | ExpressionError {
  return (
    typeof err === "object" &&
    err != null &&
    typeof (err as any).message === "string"
  );
}

export function renderError(error: unknown) {
  if (isErrorWithMessage(error) && error.friendly) {
    return error;
  }
  return {
    message: t`Invalid expression`,
    friendly: true,
  };
}
