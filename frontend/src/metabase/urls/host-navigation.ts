/** Resolves to whether the embedding host opened the link itself. */
export type HostLinkHandler = (url: string) => Promise<boolean>;

let hostLinkHandler: HostLinkHandler | null = null;

/**
 * Hands navigation to the embedding host.
 * The host gets the first chance to open every link,
 * and links it declines open in a new window instead of routing inside the app.
 */
export function setHostLinkHandler(handler: HostLinkHandler) {
  hostLinkHandler = handler;
}

export function resetHostLinkHandler() {
  hostLinkHandler = null;
}

export function getHostLinkHandler(): HostLinkHandler | null {
  return hostLinkHandler;
}

export function hostOwnsNavigation(): boolean {
  return hostLinkHandler != null;
}
