export function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  function abort(reason?: any) {
    clearTimeout(timeout);
    controller.abort(reason);
  }
  signal?.addEventListener("abort", abort);
  const timeout = setTimeout(() => abort(new Error("Timed out")), ms);
  return controller.signal;
}
