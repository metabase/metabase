/* @flow */

import React, { Component, PropTypes } from "react";

import Button from "metabase/components/Button";
import Popover from "metabase/components/Popover";

import type { ClickObject, ClickAction } from "metabase/meta/types/Visualization";
import type { Card } from "metabase/meta/types/Card";

type Props = {
    clicked: ClickObject,
    clickActions: ?ClickAction[],
    onChangeCardAndRun: (card: ?Card) => void,
    onClose: () => void
};

type State = {
    popoverIndex: ?number;
}

export default class ChartClickActions extends Component<*, Props, State> {
    state: State = {
        popoverIndex: null
    };

    close = () => {
        this.setState({ popoverIndex: null });
        if (this.props.onClose) {
            this.props.onClose();
        }
    }

    render() {
        const { clicked, clickActions, onChangeCardAndRun } = this.props;

        if (!clicked || !clickActions || clickActions.length === 0) {
            return null;
        }

        let { popoverIndex } = this.state;
        if (clickActions.length === 1 && clickActions[0].popover && clickActions[0].default) {
            popoverIndex = 0;
        }

        let popover;
        if (popoverIndex != null && clickActions[popoverIndex].popover) {
            const PopoverContent = clickActions[popoverIndex].popover;
            popover = (
                <PopoverContent
                    onChangeCardAndRun={onChangeCardAndRun}
                    onClose={this.close}
                />
            );
        }

        return (
            <Popover
                target={clicked.element}
                targetEvent={clicked.event}
                onClose={this.close}
                verticalAttachments={["bottom", "top"]}
                sizeToFit
            >
                { popover ?
                    popover
                :
                    <div className="px1 pt1 flex flex-column">
                        { clickActions.map((action, index) =>
                            <Button
                                key={index}
                                className="mb1"
                                medium
                                onClick={() => {
                                    if (action.popover) {
                                        this.setState({ popoverIndex: index });
                                    } else if (action.card) {
                                        onChangeCardAndRun(action.card());
                                        this.close();
                                    }
                                }}
                            >
                                {action.title}
                            </Button>
                        )}
                    </div>
                }
            </Popover>
        );
    }
}
