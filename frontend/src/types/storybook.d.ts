// Type declarations for Storybook 10.x packages
// These are needed because Storybook 10 uses ESM exports maps which require
// moduleResolution: "bundler" or "node16", but the codebase uses "node".

declare module "@storybook/react-webpack5" {
  export * from "@storybook/react-webpack5/dist/index";
}

declare module "@storybook/react" {
  export * from "@storybook/react/dist/index";
}

declare module "storybook/test" {
  export * from "storybook/dist/test/index";
}

declare module "storybook/actions" {
  export * from "storybook/dist/actions/index";
}

declare module "storybook/preview-api" {
  export * from "storybook/dist/preview-api/index";
}

declare module "storybook/internal/types" {
  export * from "storybook/dist/types/index";
}

declare module "storybook/internal/csf" {
  export * from "storybook/dist/csf/index";
}
