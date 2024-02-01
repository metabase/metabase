import { t } from "ttag";
import { useState } from "react";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Divider, Radio, Stack, Text } from "metabase/ui";
import Button from "metabase/core/components/Button";
import type { UsageReason } from "metabase-types/api";
import { selectStep, submitUsageReason } from "../../actions";
import { USAGE_STEP } from "../../constants";
import {
  getIsSetupCompleted,
  getIsStepActive,
  getIsStepCompleted,
} from "../../selectors";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

const COMPLETED_STEP_TITLE: Record<UsageReason, string> = {
  "self-service-analytics": t`I’ll do self-service analytics for my own company`,
  embedding: t`I’ll embed analytics into my application`,
  both: t`I’ll do a bit of both self-service and embedding`,
  "not-sure": t`I’m not sure yet`,
};

export const UsageQuestionStep = ({ stepLabel }: NumberedStepProps) => {
  const [usageReason, setUsageReason] = useState<UsageReason>(
    "self-service-analytics",
  );

  const isStepActive = useSelector(state => getIsStepActive(state, USAGE_STEP));
  const isStepCompleted = useSelector(state =>
    getIsStepCompleted(state, USAGE_STEP),
  );
  const isSetupCompleted = useSelector(getIsSetupCompleted);
  const dispatch = useDispatch();

  const handleStepSelect = () => {
    dispatch(selectStep(USAGE_STEP));
  };

  const handleSubmit = () => {
    dispatch(submitUsageReason(usageReason));
  };

  const handleCHange = (value: UsageReason) => {
    setUsageReason(value);
  };

  if (!isStepActive) {
    const title = isStepCompleted
      ? COMPLETED_STEP_TITLE[usageReason]
      : t`What will you use Metabase for?`;
    return (
      <InactiveStep
        title={title}
        label={stepLabel}
        isStepCompleted={isStepCompleted}
        isSetupCompleted={isSetupCompleted}
        onStepSelect={handleStepSelect}
      />
    );
  }

  return (
    <ActiveStep title={t`What will you use Metabase for?`} label={stepLabel}>
      <Radio.Group
        name="usage-reason"
        defaultValue="self-service-analytics"
        value={usageReason}
        onChange={handleCHange}
        label={
          <Text
            color="text-light"
            fw="normal"
          >{t`Let us know your plans with Metabase so that we can best guide you`}</Text>
        }
      >
        <Stack pt="lg">
          <Radio
            value="self-service-analytics"
            label={t`Self-service analytics for my own company`}
          />
          <Radio
            value="embedding"
            label={t`Embedding analytics into my application`}
          />
          <Radio value="both" label={t`A bit of both`} />
          <Radio value="not-sure" label={t`Not sure yet`} />
        </Stack>
      </Radio.Group>
      <Divider my="xl" />
      <Button primary onClick={handleSubmit}>
        {t`Next`}
      </Button>
    </ActiveStep>
  );
};
