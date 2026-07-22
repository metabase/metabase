import { devDiagnostics } from "../components/DevToolbar/diagnostics";

const MAX_INSPECTED_BODY_CHARS = 128 * 1024;

/**
 * Records every request the preview makes to the instance — method, endpoint,
 * status, duration, and the reason on a failure.
 *
 * Patching `window.fetch` keeps the capture inside the dev preview: hooking the
 * SDK's own client would put it within reach of any page embedding the SDK.
 */
export class SdkCallCapture {
  private uninstall: (() => void) | null = null;

  install(metabaseUrl: string | undefined): () => void {
    if (this.uninstall || typeof window === "undefined" || !metabaseUrl) {
      return () => undefined;
    }

    let metabaseOrigin: string;
    let basePath: string;
    try {
      const parsed = new URL(metabaseUrl);
      metabaseOrigin = parsed.origin;
      // A sub-path deployment prefixes every path; strip it.
      basePath = parsed.pathname.replace(/\/+$/, "");
    } catch {
      return () => undefined;
    }

    const realFetch = window.fetch.bind(window);

    // Patching is the easiest option that works for now, and `fetch` alone is
    // enough — Metabase no longer makes XHR calls.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = this.resolveUrl(input);

      if (
        url?.origin !== metabaseOrigin ||
        (basePath && !url.pathname.startsWith(basePath))
      ) {
        return realFetch(input, init);
      }

      const method = this.resolveMethod(input, init);
      const endpoint = url.pathname.slice(basePath.length) || "/";
      const startedAt = performance.now();
      const durationMs = () => Math.round(performance.now() - startedAt);

      try {
        const response = await realFetch(input, init);

        devDiagnostics.record({
          kind: "sdk-call",
          method,
          endpoint,
          status: response.status,
          durationMs: durationMs(),
          error: await this.captureFailureReason(response),
        });

        return response;
      } catch (error) {
        if (!this.isAbortError(error)) {
          devDiagnostics.record({
            kind: "sdk-call",
            method,
            endpoint,
            status: null,
            durationMs: durationMs(),
            error: error instanceof Error ? error.message : String(error),
          });
        }

        throw error;
      }
    };

    this.uninstall = () => {
      window.fetch = realFetch;
      this.uninstall = null;
    };

    return this.uninstall;
  }

  private resolveUrl(input: RequestInfo | URL): URL | null {
    try {
      if (typeof input === "string" || input instanceof URL) {
        return new URL(String(input), window.location.href);
      }

      return new URL(input.url, window.location.href);
    } catch {
      return null;
    }
  }

  private resolveMethod(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
  ): string {
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");

    return method.toUpperCase();
  }

  /**
   * The status code alone doesn't say what went wrong, and without the reason
   * the feed can only report *that* a call failed. A non-2xx carries its reason
   * in the body; a query that died after the status line was already sent
   * reports the failure in the body of a 2xx, so short 2xx bodies are checked
   * for one too.
   *
   * Always through a clone, so the caller still gets a readable body. Length is
   * bounded by `devDiagnostics.record`, which caps every string field.
   */
  private async captureFailureReason(
    response: Response,
  ): Promise<string | undefined> {
    try {
      const responseBody = await this.readWithinBound(
        response.clone(),
        MAX_INSPECTED_BODY_CHARS,
      );

      if (responseBody == null) {
        return undefined;
      }

      if (!response.ok) {
        return responseBody ? this.getErrorMessage(responseBody) : undefined;
      }

      return this.getQueryFailure(responseBody);
    } catch {
      return undefined;
    }
  }

  private async readWithinBound(
    response: Response,
    max: number,
  ): Promise<string | null> {
    const reader = response.body?.getReader?.();

    if (!reader) {
      // No stream to read incrementally (an older polyfill): the bound still
      // applies, it just costs the read to find out.
      const text = await response.text();

      return text.length > max ? null : text;
    }

    const decoder = new TextDecoder();
    let text = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return text;
        }

        text += decoder.decode(value, { stream: true });

        if (text.length > max) {
          return null;
        }
      }
    } finally {
      // Not awaited: cancelling one branch of a teed body settles only once the
      // other is read, which cannot happen while `fetch` waits here.
      reader.cancel().catch(() => undefined);
    }
  }

  /**
   * Metabase reports API errors as `{ message }`; anything else reads better raw.
   **/
  private getErrorMessage(responseBody: string): string {
    return (
      this.getStringField(this.parseResponseBody(responseBody), "message") ??
      responseBody
    );
  }

  /**
   * A query that failed after the response was already 2xx says so in its body.
   **/
  private getQueryFailure(responseBody: string): string | undefined {
    const body = this.parseResponseBody(responseBody);

    return this.getStringField(body, "status") === "failed"
      ? (this.getStringField(body, "error") ?? "Query failed")
      : undefined;
  }

  private parseResponseBody(
    responseBody: string,
  ): Record<string, unknown> | undefined {
    try {
      const parsed: unknown = JSON.parse(responseBody);

      if (typeof parsed !== "object" || parsed === null) {
        return undefined;
      }

      // Checked above to be a non-null object, and the values stay `unknown` —
      // `getStringField` narrows each one before it is used.
      return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private getStringField(
    body: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = body?.[key];

    return typeof value === "string" ? value : undefined;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }
}

export const sdkCallCapture = new SdkCallCapture();
