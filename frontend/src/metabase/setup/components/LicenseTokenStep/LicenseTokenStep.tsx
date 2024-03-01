import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { useStep } from "metabase/setup/useStep";
import { Text } from "metabase/ui";

import { submitLicenseToken } from "../../actions";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

import { LicenseTokenForm } from "./LicenseTokenForm";

export const LicenseTokenStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted, handleStepSelect, isSetupCompleted } =
    useStep("license_token");

  const storeToken = useSelector(state => state.setup.licenseToken);

  const dispatch = useDispatch();

  const handleValidSubmit = (token: string | null) => {
    dispatch(
      addUndo({
        message: t`Your license is activated`,
      }),
    );
    dispatch(submitLicenseToken(token));
  };

  const skipStep = () => {
    dispatch(submitLicenseToken(null));
  };

  if (!isStepActive) {
    return (
      <InactiveStep
        title={getInactiveStepTitle({
          isStepCompleted,
          hasStoreToken: Boolean(storeToken),
        })}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={handleStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={t`Activate your commercial license`} label={stepLabel}>
      <Text
        mb="lg"
        color={color("text-light")}
      >{t`Unlock access to your paid features before starting`}</Text>

      <LicenseTokenForm
        onValidSubmit={handleValidSubmit}
        onSkip={skipStep}
        initialValue={storeToken ?? ""}
      />
    </ActiveStep>
  );
};

const getInactiveStepTitle = ({
  isStepCompleted,
  hasStoreToken,
}: {
  isStepCompleted: boolean;
  hasStoreToken: boolean;
}) => {
  if (isStepCompleted) {
    if (hasStoreToken) {
      return t`Commercial license active`;
    } else {
      return t`I'll activate my commercial license later`;
    }
  } else {
    return t`Activate your commercial license`;
  }
};
