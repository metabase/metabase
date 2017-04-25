/* @flow */

// An UI element that is normally right-aligned and showing a currently selected filter together with chevron.
// Clicking the element will trigger a popover showing all available filter options.

import React, { Component } from "react";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "./PopoverWithTrigger";

export type ListFilterWidgetItem = {
    id: string,
    name: string,
    icon: string
}

export default class ListFilterWidget extends Component {
    props: {
        items: ListFilterWidgetItem[],
        activeItem: ListFilterWidgetItem,
        onChange: (ListFilterWidgetItem) => void
    };

    popoverRef: PopoverWithTrigger;
    iconRef: Icon;

    render() {
        const { items, activeItem, onChange } = this.props;
        return (
            <PopoverWithTrigger
                ref={p => this.popoverRef = p}
                triggerClasses="block ml-auto flex-no-shrink"
                targetOffsetY={10}
                triggerElement={
                    <div className="ml2 flex align-center text-brand">
                        <span className="text-bold">{activeItem && activeItem.name}</span>
                        <Icon
                            ref={i => this.iconRef = i}
                            className="ml1"
                            name="chevrondown"
                            width="12"
                            height="12"
                        />
                    </div>
                }
                target={() => this.iconRef}
            >
                <ol className="text-brand mt2 mb1">
                    { items.map((item, index) =>
                        <li
                            key={index}
                            className="cursor-pointer flex align-center brand-hover px2 py1 mb1"
                            onClick={() => {
                                onChange(item);
                                this.popoverRef.close();
                            }}
                        >
                            <Icon
                                className="mr1 text-light-blue"
                                name={item.icon}
                            />
                            <h4 className="List-item-title">
                                {item.name}
                            </h4>
                        </li>
                    ) }
                </ol>
            </PopoverWithTrigger>
        )
    }
}
