export const permissionOptionsToIconPaths = (
  options: Record<string, { icon: string; iconPath: string }>,
) => {
  return Object.fromEntries(
    Object.values(options).map((option) => [
      option.icon,
      new URL(option.iconPath).pathname,
    ]),
  );
};
