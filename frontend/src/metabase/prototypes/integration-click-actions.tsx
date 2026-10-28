import { t } from "ttag";

import { Button, Stack, Text } from "metabase/ui";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getDrillMenu } from "./or-filters/directions/chart-filters/drillMenu";

interface IntegrationClickActionsOptions {
  actions: ClickAction[];
  clicked: ClickObject;
  question: Question;
  groupCount: number;
  isSlow: boolean;
}

export function getIntegrationClickActions({
  actions,
  clicked,
  question,
  groupCount,
  isSlow,
}: IntegrationClickActionsOptions): ClickAction[] {
  const query = question.query();
  if (
    clicked.column == null ||
    clicked.value == null ||
    Lib.aggregations(query, 0).length === 0 ||
    Lib.stageCount(query) > 2 ||
    (Lib.stageCount(query) === 2 &&
      (Lib.aggregations(query, 1).length > 0 ||
        Lib.breakouts(query, 1).length > 0))
  ) {
    return actions;
  }
  const model = getDrillMenu({ query, clicked, groupCount, markNoun: t`bars` });
  if (model == null || model.options.length === 0) {
    return actions;
  }
  return [
    ...actions,
    {
      name: "integration-chart-filter",
      title: t`Filter…`,
      icon: "filter",
      section: "filter",
      buttonType: "horizontal",
      popover: ({ onClick }) => (
        <Stack p="md" gap="sm">
          {(["rows", "summary"] as const).map((target) => {
            const options = model.options.filter(
              (option) => option.target === target,
            );
            return options.length > 0 ? (
              <Stack key={target} gap="xs">
                <Text fw="bold">
                  {target === "rows" ? t`Filter rows` : t`Filter summary`}
                </Text>
                {options.map((option) => (
                  <Button
                    key={option.id}
                    variant="subtle"
                    onClick={() =>
                      onClick({
                        name: option.id,
                        section: "filter",
                        buttonType: "horizontal",
                        question: () => question.setQuery(option.apply(query)),
                        questionChangeBehavior: isSlow
                          ? "updateQuestion"
                          : "changeCardAndRun",
                      })
                    }
                  >
                    {option.title}
                  </Button>
                ))}
              </Stack>
            ) : null;
          })}
        </Stack>
      ),
    },
  ];
}
