/**
 * Write text to the system clipboard from a data app.
 *
 * Data apps run in a Near-Membrane sandbox that blocks the raw clipboard APIs
 * (`document.execCommand`, `navigator.clipboard`) — the full surface, and
 * *reading* the clipboard in particular, is unsafe. This is the sanctioned,
 * write-only replacement: it runs in the host realm (endowed into the sandbox),
 * coerces the input to a string, and writes it through the host clipboard. It
 * exposes no read access and no other clipboard surface, so the only capability
 * granted back to the bundle is "write a string".
 *
 * Browsers gate clipboard writes on user activation, so call it from a user
 * event (e.g. a click handler).
 */
export async function copy(text: string): Promise<void> {
  const value = String(text);

  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error(
      "Clipboard write is unavailable here — it requires a secure context (HTTPS) and user activation.",
    );
  }

  await navigator.clipboard.writeText(value);
}
