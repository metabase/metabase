import path from "node:path";

export const STORYBOOK_STATIC_DIR = path.resolve(
  __dirname,
  "..",
  "storybook-static",
);

export const SNAPSHOT_DIR = process.env.VISUAL_SNAPSHOT_DIR
  ? path.resolve(process.env.VISUAL_SNAPSHOT_DIR)
  : path.join(__dirname, "__screenshots__");
