// enterprise/frontend/test/jest.sdk.config.js

// Define the error patterns to check for
const ERROR_PATTERNS = [
  /Visualization/,
  /DashboardGrid/,
  /UNSAFE_component/,
  /Warning: React does not recognize the `.*?` prop on a DOM element/,
];

// Store the original console.error
const originalConsoleError = console.error;

// Override console.error to only fail tests on specific patterns
console.error = (...args) => {
  // Always call the original console.error first
  originalConsoleError(...args);

  // Convert all arguments to a single string for regex testing
  const errorMsg = args.join(" ");

  // Check if the error message matches any of our patterns
  const matchedPattern = ERROR_PATTERNS.find((pattern) =>
    pattern.test(errorMsg),
  );

  // If we found a match, fail the test
  if (matchedPattern) {
    throw new Error(
      `Console error detected in SDK component:\n\n` +
        `${errorMsg}\n\n` +
        `The SDK requires clean console output. Please fix this error.`,
    );
  }
};
