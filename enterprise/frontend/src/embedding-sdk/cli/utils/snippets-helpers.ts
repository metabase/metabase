import {
  GENERATED_COMPONENTS_DEFAULT_PATH,
  SDK_PACKAGE_NAME,
} from "../constants/config";

/**
 * Applies the compatibility layer for Next.js.
 */
export const getSdkPackageName = ({ isNextJs }: { isNextJs: boolean }) =>
  isNextJs ? `${SDK_PACKAGE_NAME}/nextjs` : SDK_PACKAGE_NAME;

/**
 * Where should we save the generated components by default?
 */
export const getGeneratedComponentsDefaultPath = ({
  isNextJs,
  isUsingSrcDirectory,
}: {
  isNextJs: boolean;
  isUsingSrcDirectory: boolean;
}) => {
  // If the project is a Next.js project and not using the `src` directory,
  // we generate the components in the root directory.
  if (isNextJs && !isUsingSrcDirectory) {
    return `./${GENERATED_COMPONENTS_DEFAULT_PATH}`;
  }

  // Otherwise, we assume the project is using the `src` directory
  return `./src/${GENERATED_COMPONENTS_DEFAULT_PATH}`;
};
