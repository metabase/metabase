/**
 * Lightweight crypto polyfill for browser environments
 * Provides Node.js-style randomBytes and re-exports everything from globalThis.crypto
 */

// Get the native crypto object
const nativeCrypto =
  (typeof window !== "undefined" && window.crypto) ||
  (typeof globalThis !== "undefined" && globalThis.crypto);

// Use the browser's crypto.getRandomValues for generating random bytes
function randomBytes(length) {
  if (nativeCrypto && nativeCrypto.getRandomValues) {
    const array = new Uint8Array(length);
    nativeCrypto.getRandomValues(array);
    return array;
  }

  throw new Error("No secure random number generator available");
}

// Export in Node.js style for password-generator compatibility
// eslint-disable-next-line import/no-commonjs
module.exports = {
  ...nativeCrypto,
  randomBytes,
};

// Also export as ES module for modern bundlers
export { randomBytes };
export default { ...nativeCrypto, randomBytes };
