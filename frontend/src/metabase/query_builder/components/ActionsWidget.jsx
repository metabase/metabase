/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import { getModeActions } from "metabase/qb/lib/modes";

import MetabaseAnalytics from "metabase/lib/analytics";

import cx from "classnames";
import _ from "underscore";

import type { Card, UnsavedCard } from "metabase/meta/types/Card";
import type { QueryMode, ClickAction } from "metabase/meta/types/Visualization";
import type { TableMetadata } from "metabase/meta/types/Metadata";

type Props = {
    className?: string,
    mode: QueryMode,
    card: Card,
    tableMetadata: TableMetadata,
    setCardAndRun: (card: Card) => void
};

const CIRCLE_SIZE = 48;
const NEEDLE_SIZE = 20;
const POPOVER_WIDTH = 350;

export default class ActionsWidget extends Component<*, Props, *> {
    state = {
        isVisible: false,
        isOpen: false,
        selectedActionIndex: null
    };

    componentWillMount() {
        window.addEventListener("mousemove", this.handleMouseMoved, false);
    }

    componentWillUnmount() {
        window.removeEventListener("mousemove", this.handleMouseMoved, false);
    }

    handleMouseMoved = () => {
        if (!this.state.isVisible) {
            this.setState({ isVisible: true });
        }
        this.handleMouseStoppedMoving();
    };

    handleMouseStoppedMoving = _.debounce(
        () => {
            this.setState({ isVisible: false });
        },
        1000
    );

    close = () => {
        this.setState({ isOpen: false, selectedActionIndex: null });
    };

    toggle = () => {
        if (!this.state.isOpen) {
            MetabaseAnalytics.trackEvent("Actions", "Opened Action Menu");
        }
        this.setState({
            isOpen: !this.state.isOpen,
            selectedActionIndex: null
        });
    };

    handleOnChangeCardAndRun(nextCard: UnsavedCard|Card) {
        const { card } = this.props;

        // Include the original card id if present for showing the lineage next to title
        const nextCardWithOriginalId = {
            ...nextCard,
            // $FlowFixMe
            original_card_id: card.id || card.original_card_id
        };
        if (nextCardWithOriginalId) {
            this.props.setCardAndRun(nextCardWithOriginalId);
        }
    }

    handleActionClick = (index: number) => {
        const { mode, card, tableMetadata } = this.props;
        const action = getModeActions(mode, card, tableMetadata)[index];
        if (action && action.popover) {
            this.setState({ selectedActionIndex: index });
        } else if (action && action.card) {
            const nextCard = action.card();
            if (nextCard) {
                MetabaseAnalytics.trackEvent("Actions", "Executed Action", `${action.section||""}:${action.name||""}`);
                this.handleOnChangeCardAndRun(nextCard);
            }
            this.close();
        }
    };
    render() {
        const { className, mode, card, tableMetadata } = this.props;
        const { isOpen, isVisible, selectedActionIndex } = this.state;

        const actions: ClickAction[] = getModeActions(mode, card, tableMetadata);
        if (actions.length === 0) {
            return null;
        }

        const selectedAction: ?ClickAction = selectedActionIndex == null ? null :
            actions[selectedActionIndex];
        let PopoverComponent = selectedAction && selectedAction.popover;

        return (
            <div className={cx(className, "relative")}>
                <div
                    className="circular bg-brand flex layout-centered m4 cursor-pointer"
                    style={{
                        width: CIRCLE_SIZE,
                        height: CIRCLE_SIZE,
                        transition: "opacity 300ms ease-in-out",
                        opacity: isOpen || isVisible ? 1 : 0,
                        boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.2)"
                    }}
                    onClick={this.toggle}
                >
                    <Icon
                        name="compass_needle"
                        className="text-white"
                        style={{
                            transition: "transform 500ms ease-in-out",
                            transform: isOpen
                                ? "rotate(0deg)"
                                : "rotate(720deg)"
                        }}
                        size={NEEDLE_SIZE}
                    />
                </div>
                {isOpen &&
                    <OnClickOutsideWrapper handleDismissal={() => {
                        MetabaseAnalytics.trackEvent("Actions", "Dismissed Action Menu");
                        this.close();
                    }}>
                        <div
                            className="absolute bg-white rounded bordered shadowed py1"
                            style={{
                                width: POPOVER_WIDTH,
                                bottom: "50%",
                                right: "50%",
                                zIndex: -1
                            }}
                        >
                            {PopoverComponent
                                ? <div>
                                      <div
                                          className="flex align-center text-grey-4 p1 px2"
                                      >
                                          <Icon
                                              name="chevronleft"
                                              className="cursor-pointer"
                                              onClick={() => this.setState({
                                                  selectedActionIndex: null
                                              })}
                                          />
                                          <div
                                              className="text-centered flex-full"
                                          >
                                              {selectedAction && selectedAction.title}
                                          </div>
                                      </div>
                                      <PopoverComponent
                                          onChangeCardAndRun={(card) => {
                                              if (card) {
                                                  if (selectedAction) {
                                                      MetabaseAnalytics.trackEvent("Actions", "Executed Action", `${selectedAction.section||""}:${selectedAction.name||""}`);
                                                  }
                                                  this.handleOnChangeCardAndRun(card)
                                              }
                                          }}
                                          onClose={this.close}
                                      />
                                  </div>
                                : actions.map((action, index) => (
                                      <div
                                          key={index}
                                          className="p2 flex align-center text-grey-4 brand-hover cursor-pointer"
                                          onClick={() =>
                                              this.handleActionClick(index)}
                                      >
                                          {action.icon &&
                                              <Icon
                                                  name={action.icon}
                                                  className="mr1 flex-no-shrink"
                                                  size={16}
                                              />}
                                          <div>
                                              {action.title}
                                          </div>
                                      </div>
                                  ))}
                        </div>
                    </OnClickOutsideWrapper>}
            </div>
        );
    }
}
