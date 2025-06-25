// utils/token.js

export const accessLevelToMaxDaysMap = {
  1: 30,
  2: 10,
  3: 7,
  4: 5,
  5: 3,
};

export function getTokenFromURL() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  console.log('pathParts 13', pathParts)
  const isEmbed = pathParts[0] === "embed";
  console.log('isEmbed 15', isEmbed)
  console.log('isEmbed 16', isEmbed && pathParts.length >= 3)
  if (isEmbed && pathParts.length >= 3) {
    console.log('isEmbed 18', isEmbed && pathParts.length >= 3)
    return pathParts[pathParts.length - 1];
  }
  console.log('isEmbed 21', isEmbed && pathParts.length >= 3)
  return null;
}

export function decodeJWTPayload(token) {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    console.log('json', json)
    return JSON.parse(json);
  } catch (err) {
    console.log('err', err)
    console.error("Invalid token", err);
    return null;
  }
}

/**
 * Returns maxRangeDays based on reportAccessLevel
 * ONLY if dateRestrictedVersion is true
 */

export function getMaxRangeDaysFromToken() {
  try {
    const token = getTokenFromURL();
    console.log('token', token)
    if (!token) return undefined;

    const payload = decodeJWTPayload(token);

    const isRestricted = Boolean(payload?.userInfo?.dateRestrictedVersion);
    if (!isRestricted) return undefined;
    
    console.log('payload', payload)
    const accessLevel = payload?.userInfo?.reportAccessLevel;
    console.log('accessLevel', accessLevel)
    console.log('accessLevel', accessLevelToMaxDaysMap[accessLevel] ?? undefined)

    return accessLevelToMaxDaysMap[accessLevel] ?? undefined;
  } catch (e) {
    console.warn("Failed to get max range days from token:", e);
    return undefined;
  }
}

/**
 * Returns true if dateRestrictedVersion flag is present and true
 */

export function isDateRestrictedVersionEnabled() {
  try {
    const token = getTokenFromURL();
    if (!token) return false;

    const payload = decodeJWTPayload(token);
    console.log(
      "Boolean(payload?.userInfo?.dateRestrictedVersion)",
      Boolean(payload?.userInfo?.dateRestrictedVersion)
    );
    return Boolean(payload?.userInfo?.dateRestrictedVersion);
  } catch (e) {
    console.warn("Failed to evaluate date restriction flag from token:", e);
    return false;
  }
}
