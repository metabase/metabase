import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { getSubpathSafeUrl } from "metabase/lib/urls";

import { UpsellBigCard } from "./components";

export const UpsellPythonTransforms = ({
  source,
  onClick,
}: {
  source: string;
  onClick: () => void;
}) => {
  const hasPythonTransforms = useHasTokenFeature("transforms-python");

  if (hasPythonTransforms) {
    return null;
  }

  const illustrationSrc = getSubpathSafeUrl(
    "app/assets/img/upsell-python-transforms.png",
  );

  return (
    <UpsellBigCard
      title={t`Create custom tables with Python`}
      campaign="python-transforms"
      buttonText={t`Add Python Execution`}
      source={source}
      onClick={onClick}
      illustrationSrc={illustrationSrc}
    >
      {t`Clean, reshape, and enrich your data using powerful libraries like pandas and NumPy. Write and save your own custom scripts to create reusable data transformation workflows.`}
    </UpsellBigCard>
  );
};
