import { push } from "react-router-redux";
import { t } from "ttag";

import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useDispatch } from "metabase/redux";
import { SegmentedControl } from "metabase/ui";
import * as Urls from "metabase/urls";

export type QuestionMode = "ask" | "research";

export interface QuestionModeSwitcherProps {
  value: QuestionMode;
}

export function QuestionModeSwitcher({ value }: QuestionModeSwitcherProps) {
  const { canUseNlq } = useUserMetabotPermissions();
  const dispatch = useDispatch();

  if (!canUseNlq) {
    return null;
  }

  return (
    <SegmentedControl<QuestionMode>
      value={value}
      w="16rem"
      onChange={(next) => {
        if (next === value) {
          return;
        }
        dispatch(
          push(
            next === "ask"
              ? Urls.newQuestion({ mode: "ask" })
              : Urls.newExploration(),
          ),
        );
      }}
      data={[
        { value: "ask", label: t`Explore` },
        { value: "research", label: t`Research` },
      ]}
      aria-label={t`Question mode`}
    />
  );
}
