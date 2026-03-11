import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { useDispatch } from "metabase/lib/redux";
import { Divider, Radio, Stack, Text } from "metabase/ui";
import type { UsageReason } from "metabase-types/api";

import { submitUsageReason } from "../../actions";
import { useStep } from "../../useStep";
import { ActiveStep } from "../ActiveStep";
import { InactiveStep } from "../InactiveStep";
import type { NumberedStepProps } from "../types";

const COMPLETED_STEP_TITLE: Record<UsageReason, string> = {
  get "self-service-analytics"() {
    return t`I’ll do self-service analytics for my own company`;
  },
  get embedding() {
    return t`I’ll embed analytics into my application`;
  },
  get both() {
    return t`I’ll do a bit of both self-service and embedding`;
  },
  get "not-sure"() {
    return t`I’m not sure yet`;
  },
};

export const UsageQuestionStep = ({ stepLabel }: NumberedStepProps) => {
  const { isStepActive, isStepCompleted } = useStep("usage_question");
  const [usageReason, setUsageReason] = useState<UsageReason>(
    "self-service-analytics",
  );

  const dispatch = useDispatch();

  const handleSubmit = () => {
    dispatch(submitUsageReason(usageReason));
  };

  const handleChange = (value: string) => {
    setUsageReason(value as UsageReason);
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
      />
    );
  }

  return (
    <ActiveStep title={t`What will you use Metabase for?`} label={stepLabel}>
      <Radio.Group
        name="usage-reason"
        defaultValue="self-service-analytics"
        value={usageReason}
        onChange={handleChange}
        label={
          <Text
            color="text-tertiary"
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
