export const accessLevelToMaxDaysMap = {
    1: 30,
    2: 10,
    3: 7,
    4: 5,
    5: 3,
  };

export function decodeJWTPayload(token) {
    try {
      const base64 = token.split('.')[1];
      const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (err) {
      console.error("Invalid token", err);
      return null;
    }
  }