import path from "path";

export const getFullPathFromResolvePath = ({
  resolveDir,
  resolvePath,
  aliases,
}) => {
  let fullPath;

  if (resolvePath.startsWith(".")) {
    fullPath = path.resolve(resolveDir, resolvePath);
  } else {
    const alias = Object.keys(aliases).find((alias) =>
      resolvePath.startsWith(`${alias}/`),
    );

    if (alias) {
      fullPath = path.resolve(
        path.join(aliases[alias], resolvePath.replace(alias, "")),
      );
    } else {
      fullPath = path.resolve(
        path.join(import.meta.dirname, "node_modules", resolvePath),
      );
    }
  }

  return fullPath;
};
