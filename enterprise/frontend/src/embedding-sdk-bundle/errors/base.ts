export class MetabaseError<C extends string, P> extends Error {
  public readonly code: C;
  public readonly params?: P;

  /** Provides a link to the documentation for this error. */
  public readonly docsUrl?: string;

  constructor(
    code: C,
    message: string,
    params?: P,
    context?: { docsUrl?: string },
  ) {
    super(message);
    // eslint-disable-next-line no-literal-metabase-strings -- used as the name for the user-facing error
    this.name = "MetabaseError";
    this.code = code;
    this.params = params;

    if (context?.docsUrl) {
      this.docsUrl = context.docsUrl;
    }

    Object.setPrototypeOf(this, MetabaseError.prototype);
  }
}
