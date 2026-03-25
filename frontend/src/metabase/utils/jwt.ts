export function isJWT(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  );
}

// Extract resource id from signed JWT token used in Static Embedding
export const extractResourceIdFromJwtToken = (jwtToken: string) => {
  try {
    const parts = jwtToken.split(".");
    const payloadPart = parts[1];

    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padding = base64.length % 4;

    if (padding === 2) {
      base64 += "==";
    } else if (padding === 3) {
      base64 += "=";
    } else if (padding !== 0) {
      throw new Error("Invalid base64url payload");
    }

    const jsonString = decodeURIComponent(
      Array.from(window.atob(base64))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const payload = JSON.parse(jsonString);
    const resource = payload.resource;
    const entityId = resource.dashboard || resource.question;

    return entityId;
  } catch {
    return null;
  }
};
