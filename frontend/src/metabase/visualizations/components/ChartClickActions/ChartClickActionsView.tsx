import cx from "classnames";
import { t } from "ttag";
import { Link } from "react-router";
import React from "react";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Tooltip from "metabase/core/components/Tooltip";
import { ClickAction } from "metabase-types/types/Visualization";
import {
  ActionIcon,
  ClickActionButton,
  Container,
  Section,
} from "./ChartClickActions.styled";
import {
  getGALabelForAction,
  getGroupedAndSortedActions,
  SECTIONS,
} from "./utils";

interface Props {
  clickActions: ClickAction[];

  onClick: (action: ClickAction) => void;
}

const ChartClickActionsView = ({
  clickActions,
  onClick,
}: Props): JSX.Element => {
  const sections = getGroupedAndSortedActions(clickActions);

  const hasOnlyOneSection = sections.length === 1;

  return (
    <Container>
      {sections.map(([key, actions]) => (
        <Section
          key={key}
          type={key}
          hasOnlyOneSection={hasOnlyOneSection}
          className={cx(
            { pb2: SECTIONS[key].icon === "bolt" },
            {
              ml1:
                SECTIONS[key].icon === "bolt" ||
                SECTIONS[key].icon === "sum" ||
                SECTIONS[key].icon === "breakout" ||
                (SECTIONS[key].icon === "funnel_outline" && !hasOnlyOneSection),
            },
          )}
          data-testid="drill-through-section"
        >
          {SECTIONS[key].icon === "sum" && (
            <p className="mt0 text-medium text-small">{t`Summarize`}</p>
          )}
          {SECTIONS[key].icon === "breakout" && (
            <p className="my1 text-medium text-small">{t`Break out by a…`}</p>
          )}
          {SECTIONS[key].icon === "bolt" && (
            <p className="mt2 text-medium text-small">
              {t`Automatic explorations`}
            </p>
          )}
          {SECTIONS[key].icon === "funnel_outline" && (
            <p
              className={cx(
                "text-small",
                hasOnlyOneSection ? "mt0" : "mt2",
                hasOnlyOneSection ? "text-dark" : "text-medium",
              )}
            >
              {t`Filter by this value`}
            </p>
          )}

          <div
            className={cx(
              "flex",
              {
                "justify-end": SECTIONS[key].icon === "gear",
              },
              {
                "align-center justify-center": SECTIONS[key].icon === "gear",
              },
              { "flex-column my1": SECTIONS[key].icon === "summarize" },
            )}
          >
            {actions.map((action, index) => {
              const className = cx("no-decoration", {
                "cursor-pointer": action.buttonType !== "info",
                sort: action.buttonType === "sort",
                "formatting-button": action.buttonType === "formatting",
                "horizontal-button": action.buttonType === "horizontal",
              });
              const key = action.name;
              const isLastItem = index === actions.length - 1;

              if (action.url) {
                return (
                  <div
                    key={key}
                    className={cx({
                      full: action.buttonType === "horizontal",
                    })}
                  >
                    <ClickActionButton
                      as={Link}
                      className={className}
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore // TODO [#26836]: remove this after styled component is done
                      to={action.url()}
                      type={action.buttonType}
                      onClick={() =>
                        MetabaseAnalytics.trackStructEvent(
                          "Actions",
                          "Executed Click Action",
                          getGALabelForAction(action),
                        )
                      }
                    >
                      {action.title}
                    </ClickActionButton>
                  </div>
                );
              } else if (
                action.buttonType === "sort" ||
                action.buttonType === "formatting"
              ) {
                return (
                  <Tooltip key={key} tooltip={action.tooltip}>
                    <ClickActionButton
                      className={cx(className, "flex flex-row align-center")}
                      type={action.buttonType}
                      onClick={() => onClick(action)}
                    >
                      {action.icon && (
                        <ActionIcon
                          className={cx({
                            "text-brand text-white-hover":
                              action.buttonType !== "formatting",
                          })}
                          size={action.buttonType === "formatting" ? 16 : 12}
                          name={action.icon}
                        />
                      )}
                    </ClickActionButton>
                  </Tooltip>
                );
              } else {
                return (
                  <ClickActionButton
                    key={key}
                    className={cx(className, {
                      mb1: action.buttonType === "horizontal" && !isLastItem,
                    })}
                    type={action.buttonType}
                    onClick={() => onClick(action)}
                  >
                    {action.icon && (
                      <ActionIcon
                        className="text-brand text-white-hover"
                        size={action.buttonType === "horizontal" ? 14 : 12}
                        name={action.icon}
                      />
                    )}
                    {action.title && action.title}
                  </ClickActionButton>
                );
              }
            })}
          </div>
        </Section>
      ))}
    </Container>
  );
};

export default ChartClickActionsView;
