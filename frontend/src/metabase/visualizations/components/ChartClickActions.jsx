/* @flow */

import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";

import type { ClickObject, ClickAction } from "metabase/meta/types/Visualization";
import type { Card } from "metabase/meta/types/Card";

import _ from "underscore";

const SECTIONS = {
    zoom: {
        icon: "search"
    },
    details: {
        icon: "document"
    },
    sort: {
        icon: "expand"
    },
    breakout: {
        icon: "connections"
    },
    distribution: {
        icon: "number"
    },
    aggregation: {
        icon: "line"
    },
    filter: {
        icon: "funnel"
    },
    dashboard: {
        icon: "dashboard"
    }
}
// give them indexes so we can sort the sections by the above ordering (JS objects are ordered)
Object.values(SECTIONS).map((section, index) => {
    section.index = index;
});

type Props = {
    clicked: ClickObject,
    clickActions: ?ClickAction[],
    onChangeCardAndRun: (card: ?Card) => void,
    onClose: () => void
};

type State = {
    popoverAction: ?ClickAction;
}

export default class ChartClickActions extends Component<*, Props, State> {
    state: State = {
        popoverAction: null
    };

    close = () => {
        this.setState({ popoverAction: null });
        if (this.props.onClose) {
            this.props.onClose();
        }
    }

    handleClickAction = (action) => {
        const { onChangeCardAndRun } = this.props;
        if (action.popover) {
            this.setState({ popoverAction: action });
        } else if (action.card) {
            onChangeCardAndRun(action.card());
            this.close();
        }
    }

    render() {
        const { clicked, clickActions, onChangeCardAndRun } = this.props;

        if (!clicked || !clickActions || clickActions.length === 0) {
            return null;
        }

        let { popoverAction } = this.state;
        let popover;
        if (popoverAction && popoverAction.popover) {
            const PopoverContent = popoverAction.popover;
            popover = (
                <PopoverContent
                    onChangeCardAndRun={onChangeCardAndRun}
                    onClose={this.close}
                />
            );
        }

        const sections = _.chain(clickActions)
            .groupBy("section")
            .pairs()
            .sortBy(([key]) => SECTIONS[key] ? SECTIONS[key].index : 99)
            .value();

        return (
            <Popover
                target={clicked.element}
                targetEvent={clicked.event}
                onClose={this.close}
                verticalAttachments={["top", "bottom"]}
                horizontalAttachments={["left", "center", "right"]}
                sizeToFit
            >
                { popover ?
                    popover
                :
                    <div className="text-bold text-grey-3">
                        {sections.map(([key, actions]) =>
                            <div key={key} className="border-row-divider p2 flex align-center text-default-hover">
                                <div className="flex align-center mr1">
                                    { SECTIONS[key] &&
                                        <Icon name={SECTIONS[key].icon} />
                                    }
                                </div>
                                { actions.map((action, index) =>
                                    <div
                                        key={index}
                                        className="text-brand-hover px1 cursor-pointer"
                                        onClick={() => this.handleClickAction(action)}
                                    >
                                        {action.title}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                }
            </Popover>
        );
    }
}
