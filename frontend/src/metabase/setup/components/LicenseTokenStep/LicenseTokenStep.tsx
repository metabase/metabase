import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useStep } from "metabase/setup/useStep";
import { Text } from "metabase/ui";

import { submitLicenseToken } from "../../actions";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

import { LicenseTokenForm } from "./LicenseTokenForm";
import styles from "./LicenseTokenStep.module.css";

export const LicenseTokenStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted } = useStep("license_token");

  const storeToken = useSelector((state) => state.setup.licenseToken);

  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const handleSubmit = async (token: string | null) => {
    try {
      await dispatch(submitLicenseToken(token)).unwrap();
      sendToast({ message: t`Your license is activated` });
    } catch (err) {
      console.error(err);
      throw new Error(
        t`This token doesn’t seem to be valid. Double-check it, then contact support if you think it should be working.`,
      );
    }
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
      />
    );
  }

  return (
    <ActiveStep
      title={t`Activate your commercial license`}
      label={stepLabel}
      className={styles.licenseTokenStep}
    >
      <Text
        mb="lg"
        c="text-tertiary"
      >{t`Unlock access to paid features if you'd like to try them out`}</Text>

      <LicenseTokenForm
        onSubmit={handleSubmit}
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
