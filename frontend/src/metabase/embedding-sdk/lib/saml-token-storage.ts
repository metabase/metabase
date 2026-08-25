import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

class TypedStorage<T> {
  constructor(private key: string) {}

  // Get data with proper typing
  get(): T | null {
    const data = localStorage.getItem(this.key);
    if (!data) {
      return null;
    }

    try {
      // Unjustified type cast. FIXME
      return JSON.parse(data) as T;
    } catch (e) {
      throw new Error(
        // Unjustified type cast. FIXME
        `Failed to parse stored data for key "${this.key}": ${(e as Error).message}`,
      );
    }
  }

  // Set data with type checking
  set(value: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(value));
    } catch (e) {
      throw new Error(
        // Unjustified type cast. FIXME
        `Failed to store data for key "${this.key}": ${(e as Error).message}`,
      );
    }
  }

  // Remove data
  remove(): void {
    try {
      localStorage.removeItem(this.key);
    } catch (e) {
      throw new Error(
        // Unjustified type cast. FIXME
        `Failed to remove data for key "${this.key}": ${(e as Error).message}`,
      );
    }
  }
}

export const samlTokenStorage = new TypedStorage<MetabaseEmbeddingSessionToken>(
  "METABASE_AUTH_TOKEN",
);
