const RESTRICTED_CONSOLE_PATTERNS = [
  /UNSAFE_component.*Visualization/,
  /UNSAFE_component.*DashboardGrid/,
  /Warning: React does not recognize the `.*?` prop on a DOM element/,
  /Warning: Received `.*?` for a non-boolean attribute `.*?`./,
];

// Store the original console.error
const originalConsoleError = console.error;

// Override console.error to only fail tests on specific patterns
console.error = (...args) => {
  originalConsoleError(...args);

  const errorMsg = args.join(" ");

  const matchedPattern = RESTRICTED_CONSOLE_PATTERNS.find((pattern) =>
    pattern.test(errorMsg),
  );

  if (matchedPattern) {
    throw new Error(
      `Console error detected. This component is used in the SDK, so we need clean output in the console for end users:\n\n` +
        `${errorMsg}\n\n`,
    );
  }
};
