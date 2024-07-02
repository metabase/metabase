export const MAX_ERROR_LOGS = 20;

export function captureConsoleErrors() {
  console.errorBuffer = [];

  const originalError = console.error;

  console.error = function (...args) {
    if (console.errorBuffer.length >= MAX_ERROR_LOGS) {
      console.errorBuffer.pop();
    }
    console.errorBuffer.unshift(Array.from(args));
    originalError(...args);
  };
}
