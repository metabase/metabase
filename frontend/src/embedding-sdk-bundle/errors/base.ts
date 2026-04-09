import type { MetabaseErrorCode } from "./error-code";

export class MetabaseError<C extends MetabaseErrorCode, P> extends Error {
  public readonly code: C;
  public readonly params?: P;

  constructor(code: C, message: string, params?: P) {
    super(message);
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- used as the name for the user-facing error
    this.name = "MetabaseError";
    this.code = code;
    this.params = params;
    Object.setPrototypeOf(this, MetabaseError.prototype);
  }
}
