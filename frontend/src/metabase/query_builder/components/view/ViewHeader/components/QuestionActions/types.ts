import type { JSX, ReactNode } from "react";

import type { IconName } from "metabase/ui";

export type RegularQuestionExtraActionConfig = {
  key: string;
  title: ReactNode;
  icon: IconName;
  testId?: string;
  withTopSeparator?: boolean;
  tooltip?: string;
  action?: () => void;
  disabled?: boolean;
};

export type QuestionExtraActionWithCustomComponentConfig = {
  key: string;
  component: JSX.Element;
};

export type QuestionExtraActionConfig =
  | RegularQuestionExtraActionConfig
  | QuestionExtraActionWithCustomComponentConfig;
