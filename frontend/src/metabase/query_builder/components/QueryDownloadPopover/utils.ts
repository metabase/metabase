// Excel and images always use formatting
export const checkCanManageFormatting = (format: string) =>
  format !== "xlsx" && format !== "png";
