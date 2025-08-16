import type { OptionsType } from "./types";

/**
 * Convert a byte array to hexadecimal string representation.
 */
function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a base64 string back to bytes for display.
 */
function base64ToBytes(base64: string): Uint8Array {
  try {
    // In browser environment, use atob
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    // Fallback: return empty array if decoding fails
    return new Uint8Array(0);
  }
}

/**
 * Format binary data for display.
 * 
 * @param value - The binary value (could be base64 string, byte array, or other format)
 * @param options - Formatting options
 * @returns Formatted binary string
 */
export function formatBinary(value: unknown, options: OptionsType = {}): string {
  if (value == null) {
    return "";
  }

  const { binary_format = "base64", binary_truncate = 32 } = options;

  let displayValue: string;

  if (typeof value === "string") {
    // Assume it's a base64-encoded string from the backend
    if (binary_format === "hex") {
      try {
        const bytes = base64ToBytes(value);
        displayValue = "0x" + bytesToHex(bytes);
      } catch {
        // If conversion fails, display as-is
        displayValue = value;
      }
    } else {
      // Display as base64 (default)
      displayValue = value;
    }
  } else if (value instanceof Uint8Array || Array.isArray(value)) {
    // Handle byte arrays
    if (binary_format === "hex") {
      displayValue = "0x" + bytesToHex(value as Uint8Array | number[]);
    } else {
      // Convert to base64
      try {
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as number[]);
        displayValue = btoa(String.fromCharCode(...Array.from(bytes)));
      } catch {
        displayValue = "[Binary Data]";
      }
    }
  } else {
    // Unknown format, display as string
    displayValue = String(value);
  }

  // Truncate if too long
  if (displayValue.length > binary_truncate) {
    displayValue = displayValue.substring(0, binary_truncate) + "...";
  }

  return displayValue;
}