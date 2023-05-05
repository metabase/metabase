import React from "react";
import { ClickAction } from "metabase/modes/types";
import { Container } from "./ChartClickActions.styled";
import { getGroupedAndSortedActions, getSectionTitle } from "./utils";
import ChartClickActionsSection from "./ChartClickActionsSection";
import ClickActionControl from "./ClickActionControl";

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
      {sections.map(([key, actions]) => {
        const sectionTitle = getSectionTitle(key, actions);

        return (
          <ChartClickActionsSection
            key={key}
            withDivider={key === "records" && !hasOnlyOneSection}
            title={sectionTitle}
          >
            {actions.map((action, index) => (
              <ClickActionControl
                key={action.name}
                action={action}
                onClick={() => onClick(action)}
              />
            ))}
          </ChartClickActionsSection>
        );
      })}

      {/*{sections.map(([key, actions]) => {*/}
      {/*  switch (key) {*/}
      {/*    case "filter": {*/}
      {/*      return (*/}
      {/*        <ChartClickActionsSection key={key} title={}>*/}
      {/*          <p*/}
      {/*            className={cx(*/}
      {/*              "text-small",*/}
      {/*              {*/}
      {/*                mt1: !hasOnlyOneSection,*/}
      {/*              },*/}
      {/*              hasOnlyOneSection ? "text-medium" : "text-light",*/}
      {/*            )}*/}
      {/*          >*/}
      {/*            {getFilterSectionTitle(actions)}*/}
      {/*          </p>*/}
      {/*          <div*/}
      {/*            className={cx({*/}
      {/*              flex: actions.some(*/}
      {/*                ({ buttonType }) => buttonType === "token-filter",*/}
      {/*              ),*/}
      {/*            })}*/}
      {/*          >*/}
      {/*            {actions.map((action, index) => {*/}
      {/*              const { buttonType } = action;*/}

      {/*              if (buttonType === "horizontal") {*/}
      {/*                return (*/}
      {/*                  <HorizontalClickActionButton*/}
      {/*                    key={key}*/}
      {/*                    // className={cx(className, {*/}
      {/*                    //   mb1: !isLastItem,*/}
      {/*                    // })}*/}
      {/*                    small*/}
      {/*                    onClick={() => onClick(action)}*/}
      {/*                    icon={*/}
      {/*                      action.icon && (*/}
      {/*                        <ClickActionButtonIcon name={action.icon} />*/}
      {/*                      )*/}
      {/*                    }*/}
      {/*                  >*/}
      {/*                    {action.title}*/}
      {/*                  </HorizontalClickActionButton>*/}
      {/*                );*/}
      {/*              } else {*/}
      {/*                return (*/}
      {/*                  <ClickActionButton*/}
      {/*                    key={key}*/}
      {/*                    // className={cx(className, {*/}
      {/*                    //   mb1: action.buttonType === "horizontal" && !isLastItem,*/}
      {/*                    // })}*/}
      {/*                    type={action.buttonType}*/}
      {/*                    onClick={() => onClick(action)}*/}
      {/*                  >*/}
      {/*                    {action.icon && (*/}
      {/*                      <ActionIcon*/}
      {/*                        size={*/}
      {/*                          action.buttonType === "horizontal" ? 14 : 12*/}
      {/*                        }*/}
      {/*                        name={action.icon}*/}
      {/*                      />*/}
      {/*                    )}*/}
      {/*                    {action.title}*/}
      {/*                  </ClickActionButton>*/}
      {/*                );*/}
      {/*              }*/}
      {/*            })}*/}
      {/*          </div>*/}
      {/*        </ChartClickActionsSection>*/}
      {/*      );*/}
      {/*    }*/}
      {/*  }*/}

      {/*  return (*/}
      {/*    <Section*/}
      {/*      key={key}*/}
      {/*      type={key}*/}
      {/*      hasOnlyOneSection={hasOnlyOneSection}*/}
      {/*      className={cx({*/}
      {/*        ml1:*/}
      {/*          SECTIONS[key].icon === "sum" ||*/}
      {/*          (SECTIONS[key].icon === "funnel_outline" && !hasOnlyOneSection),*/}
      {/*      })}*/}
      {/*      data-testid="drill-through-section"*/}
      {/*    >*/}
      {/*      {SECTIONS[key].icon === "sum" && (*/}
      {/*        <p className="mt0 text-medium text-small">{t`Summarize`}</p>*/}
      {/*      )}*/}
      {/*      {key === "filter" && (*/}
      {/*        <p*/}
      {/*          className={cx(*/}
      {/*            "text-small",*/}
      {/*            "mt1",*/}
      {/*            hasOnlyOneSection ? "text-medium" : "text-light",*/}
      {/*          )}*/}
      {/*        >*/}
      {/*          {t`Filter by this value`}*/}
      {/*        </p>*/}
      {/*      )}*/}

      {/*      <div*/}
      {/*        className={cx("flex", {*/}
      {/*          "justify-end": SECTIONS[key].icon === "gear",*/}
      {/*          "align-center justify-center": SECTIONS[key].icon === "gear",*/}
      {/*          "flex-column my1":*/}
      {/*            key === "filter" || SECTIONS[key].icon === "summarize",*/}
      {/*        })}*/}
      {/*      >*/}
      {/*        {actions.map((action, index) => {*/}
      {/*          const className = cx("no-decoration", {*/}
      {/*            "cursor-pointer": action.buttonType !== "info",*/}
      {/*            sort: action.buttonType === "sort",*/}
      {/*            "formatting-button": action.buttonType === "formatting",*/}
      {/*          });*/}
      {/*          const key = action.name;*/}
      {/*          const isLastItem = index === actions.length - 1;*/}

      {/*          const { buttonType } = action;*/}

      {/*          if (buttonType === "horizontal") {*/}
      {/*            return (*/}
      {/*              <HorizontalClickActionButton*/}
      {/*                key={key}*/}
      {/*                className={cx(className, {*/}
      {/*                  mb1: !isLastItem,*/}
      {/*                })}*/}
      {/*                small*/}
      {/*                onClick={() => onClick(action)}*/}
      {/*                icon={*/}
      {/*                  action.icon && (*/}
      {/*                    <ClickActionButtonIcon name={action.icon} />*/}
      {/*                  )*/}
      {/*                }*/}
      {/*              >*/}
      {/*                {action.title}*/}
      {/*              </HorizontalClickActionButton>*/}
      {/*            );*/}
      {/*          }*/}

      {/*          if (action.url) {*/}
      {/*            return (*/}
      {/*              <div*/}
      {/*                key={key}*/}
      {/*                className={cx({*/}
      {/*                  full: action.buttonType === "horizontal",*/}
      {/*                })}*/}
      {/*              >*/}
      {/*                <ClickActionButton*/}
      {/*                  as={Link}*/}
      {/*                  className={className}*/}
      {/*                  // TODO [#26836]: remove this after styled component is done*/}
      {/*                  to={action.url()}*/}
      {/*                  type={action.buttonType}*/}
      {/*                  onClick={() =>*/}
      {/*                    MetabaseAnalytics.trackStructEvent(*/}
      {/*                      "Actions",*/}
      {/*                      "Executed Click Action",*/}
      {/*                      getGALabelForAction(action),*/}
      {/*                    )*/}
      {/*                  }*/}
      {/*                >*/}
      {/*                  {action.title}*/}
      {/*                </ClickActionButton>*/}
      {/*              </div>*/}
      {/*            );*/}
      {/*          } else if (*/}
      {/*            action.buttonType === "sort" ||*/}
      {/*            action.buttonType === "formatting"*/}
      {/*          ) {*/}
      {/*            return (*/}
      {/*              <Tooltip key={key} tooltip={action.tooltip}>*/}
      {/*                <ClickActionButton*/}
      {/*                  className={cx(className, "flex flex-row align-center")}*/}
      {/*                  type={action.buttonType}*/}
      {/*                  onClick={() => onClick(action)}*/}
      {/*                >*/}
      {/*                  {action.icon && (*/}
      {/*                    <GearIcon*/}
      {/*                      className={cx({*/}
      {/*                        "text-brand text-white-hover":*/}
      {/*                          action.buttonType !== "formatting",*/}
      {/*                      })}*/}
      {/*                      size={action.buttonType === "formatting" ? 16 : 12}*/}
      {/*                      name={action.icon}*/}
      {/*                    />*/}
      {/*                  )}*/}
      {/*                </ClickActionButton>*/}
      {/*              </Tooltip>*/}
      {/*            );*/}
      {/*          } else {*/}
      {/*            return (*/}
      {/*              <ClickActionButton*/}
      {/*                key={key}*/}
      {/*                className={cx(className, {*/}
      {/*                  mb1: action.buttonType === "horizontal" && !isLastItem,*/}
      {/*                })}*/}
      {/*                type={action.buttonType}*/}
      {/*                onClick={() => onClick(action)}*/}
      {/*              >*/}
      {/*                {action.icon && (*/}
      {/*                  <ActionIcon*/}
      {/*                    size={action.buttonType === "horizontal" ? 14 : 12}*/}
      {/*                    name={action.icon}*/}
      {/*                  />*/}
      {/*                )}*/}
      {/*                {action.title}*/}
      {/*              </ClickActionButton>*/}
      {/*            );*/}
      {/*          }*/}
      {/*        })}*/}
      {/*      </div>*/}
      {/*    </Section>*/}
      {/*  );*/}
      {/*})}*/}
    </Container>
  );
};

export default ChartClickActionsView;
