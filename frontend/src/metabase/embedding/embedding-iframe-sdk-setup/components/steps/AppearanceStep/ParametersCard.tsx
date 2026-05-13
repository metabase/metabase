import { t } from "ttag";

import { Card, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../../../context";
import { ParameterSettings } from "../../ParameterSettings";

export const ParametersCard = () => {
  const { experience } = useSdkIframeEmbedSetupContext();

  if (experience !== "dashboard" && experience !== "chart") {
    return null;
  }

  return (
    <Card p="md">
      <Text size="lg" fw="bold" mb="xs">
        {t`Parameters`}
      </Text>

      <Text size="sm" c="text-secondary" mb="lg">
        {experience === "dashboard"
          ? t`Set default values and control visibility`
          : t`Set default values`}
      </Text>

      <ParameterSettings />
    </Card>
  );
};
