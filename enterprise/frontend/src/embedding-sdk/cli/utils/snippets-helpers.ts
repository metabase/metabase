import { SDK_PACKAGE_NAME } from "../constants/config";

/**
 * Applies the compatibility layer for Next.js.
 */
export const getSdkPackageName = ({ isNextJs }: { isNextJs: boolean }) =>
  isNextJs ? `${SDK_PACKAGE_NAME}/nextjs` : SDK_PACKAGE_NAME;
