import type { MetabaseEmbeddingSessionToken } from "embedding-sdk/types/refresh-token";

class TypedStorage<T> {
  constructor(
    private key: string,
    private defaultValue: T,
  ) {}

  // Get data with proper typing
  get(): T {
    const data = localStorage.getItem(this.key);
    if (data === null) {
      return this.defaultValue;
    }
    try {
      return JSON.parse(data) as T;
    } catch (e) {
      console.error(
        `Error parsing localStorage data for key "${this.key}":`,
        e,
      );
      return this.defaultValue;
    }
  }

  // Set data with type checking
  set(value: T): void {
    localStorage.setItem(this.key, JSON.stringify(value));
  }

  // Remove data
  remove(): void {
    localStorage.removeItem(this.key);
  }
}

export const authTokenStorage =
  new TypedStorage<MetabaseEmbeddingSessionToken | null>(
    "METABASE_AUTH_TOKEN",
    null,
  );
