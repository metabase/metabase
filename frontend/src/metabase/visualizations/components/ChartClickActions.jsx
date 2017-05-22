/* @flow */

import React, { Component } from "react";
import cx from 'classnames'

import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";

import MetabaseAnalytics from "metabase/lib/analytics";

import type { ClickObject, ClickAction } from "metabase/meta/types/Visualization";
import type { Card } from "metabase/meta/types/Card";

import _ from "underscore";

const SECTIONS = {
    zoom: {
        icon: "zoom"
    },
    records: {
        icon: "table2"
    },
    details: {
        icon: "document"
    },
    sort: {
        icon: "sort"
    },
    breakout: {
        icon: "breakout"
    },
    sum: {
        icon: "sum"
    },
    averages: {
        icon: "curve"
    },
    filter: {
        icon: "funneloutline"
    },
    dashboard: {
        icon: "dashboard"
    },
    distribution: {
        icon: "bar"
    }
}
// give them indexes so we can sort the sections by the above ordering (JS objects are ordered)
Object.values(SECTIONS).map((section, index) => {
    // $FlowFixMe
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

    handleClickAction = (action: ClickAction) => {
        const { onChangeCardAndRun } = this.props;
        if (action.popover) {
            this.setState({ popoverAction: action });
        } else if (action.card) {
            const card = action.card();
            MetabaseAnalytics.trackEvent("Actions", "Executed Click Action", `${action.section||""}:${action.name||""}`);
            onChangeCardAndRun(card);
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
                    onChangeCardAndRun={(card) => {
                        if (popoverAction) {
                            MetabaseAnalytics.trackEvent("Action", "Executed Click Action", `${popoverAction.section||""}:${popoverAction.name||""}`);
                        }
                        onChangeCardAndRun(card);
                    }}
                    onClose={() => {
                        MetabaseAnalytics.trackEvent("Action", "Dismissed Click Action Menu");
                        this.close();
                    }}
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
                onClose={() => {
                    MetabaseAnalytics.trackEvent("Action", "Dismissed Click Action Menu");
                    this.close();
                }}
                verticalAttachments={["top", "bottom"]}
                horizontalAttachments={["left", "center", "right"]}
                sizeToFit
                pinInitialAttachment
            >
                { popover ?
                    popover
                :
                    <div className="text-bold text-grey-3">
                        {sections.map(([key, actions]) =>
                            <div key={key} className="border-row-divider p2 flex align-center text-default-hover">
                                <Icon name={SECTIONS[key] && SECTIONS[key].icon || "unknown"} className="mr3" size={16} />
                                { actions.map((action, index) =>
                                    <div
                                        key={index}
                                        className={cx("text-brand-hover cursor-pointer", { "pr2": index === actions.length - 1, "pr4": index != actions.length - 1})}
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
