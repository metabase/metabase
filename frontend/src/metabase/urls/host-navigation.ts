/** Resolves to whether the host opened the link itself. */
export type HostLinkHandler = (url: string) => Promise<boolean>;

let hostLinkHandler: HostLinkHandler | null = null;

/**
 * Installing a handler also makes same-origin links open in a new window
 * instead of routing inside the app.
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
