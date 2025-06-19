import { match } from "ts-pattern";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { Icon, Menu } from "metabase/ui";

import type { UseDashcardMenuItemsProps } from "../types";

export const EditLinkMenuItem = ({
  question,
}: Pick<UseDashcardMenuItemsProps, "question">) => {
  const { onEditQuestion } = useDashboardContext();
  return match(question?.type())
    .with("question", () => (
      <Menu.Item
        leftSection={<Icon name="pencil" />}
        onClick={() => onEditQuestion?.(question)}
      >
        {t`Edit question`}
      </Menu.Item>
    ))
    .with("model", () => (
      <Menu.Item
        leftSection={<Icon name="pencil" />}
        onClick={() => onEditQuestion?.(question, "query")}
      >
        {t`Edit model`}
      </Menu.Item>
    ))
    .with("metric", () => (
      <Menu.Item
        leftSection={<Icon name="pencil" />}
        onClick={() => onEditQuestion?.(question, "query")}
      >
        {t`Edit metric`}
      </Menu.Item>
    ))
    .otherwise(() => null);
};
