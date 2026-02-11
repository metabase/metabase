import { useCallback, useEffect, useState } from "react";

import {
  useChangePlanMutation,
  useCheckTrialAvailableQuery,
  useGetChangePlanPreviewQuery,
  useGetPlanQuery,
  useStartTrialMutation,
} from "metabase/api/cloud-proxy";
import { Center, Loader, Modal } from "metabase/ui";

import { UpgradeModalError } from "./UpgradeModalError";
import { UpgradeModalInitial } from "./UpgradeModalInitial";
import { UpgradeModalLoading } from "./UpgradeModalLoading";
import type { ModalStep, UpgradeFlow } from "./types";

interface UpgradeModalProps {
  opened: boolean;
  onClose: () => void;
}

function formatCentsToDollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export function UpgradeModal({ opened, onClose }: UpgradeModalProps) {
  const [step, setStep] = useState<ModalStep>("initial");

  // Check if trial is available (always needed)
  const {
    data: trialData,
    isLoading: isTrialLoading,
    isError: isTrialError,
  } = useCheckTrialAvailableQuery(undefined, { skip: !opened });

  const isTrialAvailable = trialData?.available ?? false;
  const flow: UpgradeFlow = isTrialAvailable ? "trial" : "upgrade";
  const planAlias = trialData?.plan_alias;

  // Get pricing preview - only needed when trial is NOT available (states 2 & 3)
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
  } = useGetChangePlanPreviewQuery(
    { new_plan_alias: planAlias ?? "" },
    { skip: !opened || !planAlias || isTrialAvailable },
  );

  // Determine if user is currently on trial (amount due is $0 when upgrading)
  const isOnTrial = previewData?.amount_due_now === 0;

  // Get plan details - only needed when NOT trial available AND on trial (state 2)
  const {
    data: planData,
    isLoading: isPlanLoading,
    isError: isPlanError,
  } = useGetPlanQuery(
    { plan_alias: planAlias ?? "" },
    { skip: !opened || !planAlias || isTrialAvailable || !isOnTrial },
  );

  // For trial available (state 1), show $0.00; otherwise use preview data
  const dueToday = isTrialAvailable
    ? "$0.00"
    : previewData
      ? formatCentsToDollars(previewData.amount_due_now)
      : "";

  // Only show plan pricing for state 2 (not available + on trial)
  const showPlanPricing = !isTrialAvailable && isOnTrial;

  // Check if any required API call failed
  const hasQueryError =
    isTrialError ||
    (!isTrialAvailable && isPreviewError) ||
    (showPlanPricing && isPlanError);

  const planPricing = planData
    ? {
        price: planData.price,
        includedUsers: planData.users_included,
        pricePerAdditionalUser: planData.per_user_price,
        billingPeriodMonths: planData.billing_period_months,
      }
    : undefined;

  const [startTrial] = useStartTrialMutation();
  const [changePlan] = useChangePlanMutation();

  // Reset step when modal opens
  useEffect(() => {
    if (opened) {
      setStep("initial");
    }
  }, [opened]);

  const handleConfirm = useCallback(async () => {
    setStep("loading");

    try {
      if (flow === "trial") {
        await startTrial().unwrap();
      } else if (planAlias) {
        await changePlan({ new_plan_alias: planAlias }).unwrap();
      }
      // Stay in loading state - UpgradeModalLoading will poll for the
      // no-upsell feature and show success when it arrives
    } catch {
      setStep("error");
    }
  }, [flow, planAlias, startTrial, changePlan]);

  const handleClose = useCallback(() => {
    setStep("initial");
    onClose();
  }, [onClose]);

  // Loading state depends on which calls are needed:
  // State 1 (trial up available): only wait for trial up check
  // State 2 (trial up not available + on trial): wait for all 3
  // State 3 (trial up not available + not on trial): wait for trial up check + preview
  const isDataLoading =
    isTrialLoading ||
    (!isTrialAvailable && isPreviewLoading) ||
    (showPlanPricing && isPlanLoading);

  return (
    <Modal opened={opened} onClose={handleClose} size="md" padding="lg">
      {step === "initial" && isDataLoading && !hasQueryError && (
        <Center h={200}>
          <Loader />
        </Center>
      )}
      {step === "initial" && !isDataLoading && !hasQueryError && (
        <UpgradeModalInitial
          flow={flow}
          dueToday={dueToday}
          showPlanPricing={showPlanPricing}
          planPricing={planPricing}
          onCancel={handleClose}
          onConfirm={handleConfirm}
        />
      )}
      {step === "loading" && (
        <UpgradeModalLoading flow={flow} onDone={handleClose} />
      )}
      {(step === "error" || (step === "initial" && hasQueryError)) && (
        <UpgradeModalError onClose={handleClose} />
      )}
    </Modal>
  );
}
