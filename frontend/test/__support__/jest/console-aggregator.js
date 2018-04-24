const CONSOLE_IGNORE_REGEX_DEFAULT = /Warning: (Accessing createClass|Accessing PropTypes|validateDOMNesting|Each child in an array or iterator should have a unique "key" prop|Failed prop type)/;
const CONSOLE_IGNORE_METHODS_DEFAULT = ["warn", "error"];

module.exports = (
  regex = CONSOLE_IGNORE_REGEX_DEFAULT,
  methods = CONSOLE_IGNORE_METHODS_DEFAULT,
) => {
  const CONSOLE = { ...global.console };
  const CONSOLE_IGNORED = {};

  for (const method of methods) {
    jest.spyOn(global.console, method).mockImplementation(function(...args) {
      const match = String(args[0]).match(regex);
      if (match) {
        CONSOLE_IGNORED[match[0]] = (CONSOLE_IGNORED[match[0]] || 0) + 1;
      } else {
        CONSOLE[method].apply(this, args);
      }
    });
  }

  afterAll(async () => {
    if (Object.keys(CONSOLE_IGNORED).length > 0) {
      CONSOLE.log("IGNORED LOGS:\n", CONSOLE_IGNORED);
    }
  });
};
