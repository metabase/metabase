// startTimer starts a timer and returns a callback function.
// Example usage:
// const t = startTimer()
// await vSlow()
// t(duration => console.log(`That took ${duration}ms!`))
// The function passed to `t` won't get called if `performance` isn't available.
export function startTimer() {
  if (typeof performance !== "object") {
    // if the current environment doesn't have performance return a no-op function
    return () => {};
  }
  const start = performance.now();
  return f => f(performance.now() - start);
}
