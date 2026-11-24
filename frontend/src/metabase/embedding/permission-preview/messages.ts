const READY = "permission-preview-ready";
const TOKEN = "permission-preview-token";
const LOCATION = "permission-preview-location";

export type PreviewFrameReadyMessage = { type: typeof READY };
export type PreviewFrameTokenMessage = { type: typeof TOKEN; token: string };
export type PreviewFrameLocationMessage = {
  type: typeof LOCATION;
  item: string;
};

export function createReadyMessage(): PreviewFrameReadyMessage {
  return { type: READY };
}

export function createTokenMessage(token: string): PreviewFrameTokenMessage {
  return { type: TOKEN, token };
}

export function createLocationMessage(
  item: string,
): PreviewFrameLocationMessage {
  return { type: LOCATION, item };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isReadyMessage(
  data: unknown,
): data is PreviewFrameReadyMessage {
  return isRecord(data) && data.type === READY;
}

export function isTokenMessage(
  data: unknown,
): data is PreviewFrameTokenMessage {
  return (
    isRecord(data) && data.type === TOKEN && typeof data.token === "string"
  );
}

export function isLocationMessage(
  data: unknown,
): data is PreviewFrameLocationMessage {
  return (
    isRecord(data) && data.type === LOCATION && typeof data.item === "string"
  );
}
