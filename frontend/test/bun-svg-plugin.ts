import { mock } from "bun:test";

// Mock SVG imports with ?component query param (webpack feature)
// These return React components
mock.module("img/bridge.svg?component", () => ({
  default: () => null,
}));

mock.module("assets/img/metabot-failure.svg?component", () => ({
  default: () => null,
}));

mock.module("assets/img/metabot-success.svg?component", () => ({
  default: () => null,
}));

// Mock SVG imports with ?source query param (returns raw SVG string)
mock.module("metabase/ui/components/icons/Icon/icons/play.svg?source", () => ({
  default: "<svg></svg>",
}));

// Add more mocks as needed when tests fail with similar errors
