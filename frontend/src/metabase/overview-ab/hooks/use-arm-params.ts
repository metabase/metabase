import { useCallback, useState } from "react";

import { useSearchParams } from "metabase/router";

import type { Arm } from "../types";

type ArmOption = { value: string; label: string };

type UseArmParamsOpts = {
  /** Search param holding the active id; absent means the baseline. */
  param: string;
  baselineId: string;
  newOptions: ArmOption[];
  defaultNewId?: string;
};

/**
 * One baseline-vs-new axis backed by a search param. Flipping to "new" writes
 * the remembered new id; flipping back removes the param so siblings survive.
 */
export function useArmParams({
  param,
  baselineId,
  newOptions,
  defaultNewId,
}: UseArmParamsOpts) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramValue = searchParams.get(param);
  const isKnownNew = newOptions.some((option) => option.value === paramValue);

  const fallbackNewId =
    newOptions.find((option) => option.value === defaultNewId)?.value ??
    newOptions[0]?.value;
  const [rememberedNewId, setRememberedNewId] = useState(fallbackNewId);
  const newId = isKnownNew && paramValue != null ? paramValue : rememberedNewId;

  const arm: Arm = isKnownNew ? "new" : "baseline";
  const activeId = arm === "new" && newId != null ? newId : baselineId;

  const write = useCallback(
    (value: string | null) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value == null) {
          next.delete(param);
        } else {
          next.set(param, value);
        }
        return next;
      });
    },
    [param, setSearchParams],
  );

  const setArm = useCallback(
    (nextArm: Arm) => write(nextArm === "new" ? (newId ?? null) : null),
    [write, newId],
  );

  const setNewId = useCallback(
    (value: string) => {
      setRememberedNewId(value);
      write(value);
    },
    [write],
  );

  const toggleArm = useCallback(
    () => setArm(arm === "new" ? "baseline" : "new"),
    [arm, setArm],
  );

  return {
    arm,
    activeId,
    newId,
    canUseNew: newId != null,
    setArm,
    setNewId,
    toggleArm,
  };
}
