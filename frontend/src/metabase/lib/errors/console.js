/* eslint-disable no-console */
const MAX_LOGS = 20;

export function captureConsoleErrors() {
  console.errorBuffer = [];

  const originalError = console.error;

  console.error = function () {
    if (console.errorBuffer.length > MAX_LOGS) {
      console.errorBuffer.pop();
    }
    console.errorBuffer.unshift(Array.from(arguments));
    originalError(...arguments);
  };
}
