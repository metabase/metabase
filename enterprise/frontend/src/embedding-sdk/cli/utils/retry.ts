const waitFor = (delayMs: number) =>
  new Promise(resolve => setTimeout(resolve, delayMs));

export async function retry<T>(
  task: () => Promise<T>,
  options?: {
    retries?: number;
    delay?: number;
  },
): Promise<T> {
  const { retries = 10, delay = 1000 } = options ?? {};

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await waitFor(delay);
      }
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);

  throw new Error(`${reason} (retried ${retries} times)`);
}
