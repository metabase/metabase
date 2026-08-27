import type { EntityToken } from "metabase-types/api/entity";

const JWT_REGEX = /[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

export function isJWT(string: unknown): string is string {
  if (typeof string !== "string") {
    return false;
  }
  const match = JWT_REGEX.exec(string);
  return match !== null && match[0] === string;
}

/**
 * Decodes a JWT token and returns its payload.
 * Uses Uint8Array/TextDecoder instead of manual decodeURIComponent for safer UTF-8 decoding.
 *
 * @param jwtToken - JWT token string
 * @returns Decoded payload object or null if decoding fails
 */
export const decodeJwt = (
  jwtToken: string | null | undefined,
): Record<string, any> | null => {
  if (!jwtToken) {
    return null;
  }

  try {
    const parts = jwtToken.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payloadPart = parts[1];

    // Convert base64url to base64
    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const padding = base64.length % 4;
    if (padding === 2) {
      base64 += "==";
    } else if (padding === 3) {
      base64 += "=";
    } else if (padding !== 0) {
      throw new Error("Invalid base64url payload");
    }

    // Decode base64 to binary string, then to Uint8Array
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode UTF-8 bytes to string using TextDecoder (safer than manual decoding)
    const jsonString = new TextDecoder().decode(bytes);

    // Parse JSON payload
    const payload = JSON.parse(jsonString);
    return payload;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
};

/**
 * Extract resource id from signed JWT token used in Static Embedding.
 */
export const extractResourceIdFromJwtToken = (
  jwtToken: EntityToken,
): number | null => {
  const payload = decodeJwt(jwtToken);

  if (!payload?.resource) {
    return null;
  }

  const resource = payload.resource;
  const entityId = resource.dashboard || resource.question;

  return entityId ?? null;
};
