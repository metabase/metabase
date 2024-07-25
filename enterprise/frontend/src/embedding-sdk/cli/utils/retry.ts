import { AbortError } from "node-fetch";

const waitFor = (delayMs: number) =>
  new Promise(resolve => setTimeout(resolve, delayMs));

export async function retry<T>(
  task: () => Promise<T>,
  options?: { retries?: number; delay?: number },
): Promise<T> {
  const { retries = 10, delay = 1000 } = options ?? {};

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (error instanceof AbortError) {
        if (attempt < retries) {
          await waitFor(delay);
        }
      } else {
        throw error;
      }
    }
  }

  throw new Error("retry attempt exceeded");
}
