import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";

interface Props {
  warning: SdkLicenseProblem | null;
}

export const SdkLicenseWarningBanner = ({ warning }: Props) => {
  if (!warning) {
    return null;
  }

  return (
    <div>
      w={warning.message}, level={warning.level}
    </div>
  );
};
