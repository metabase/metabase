'use strict';

import AddToDashboardPopover from './AddToDashboardPopover.react';
import Icon from "metabase/components/Icon.react";
import Popover from "metabase/components/Popover.react";

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'AddToDashboard',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired
    },
    getInitialState: function () {
        return {
            isOpen: false
        };
    },
    toggle: function () {
        var isOpen = !this.state.isOpen;
        this.setState({
            isOpen: isOpen
        });
    },
    addToDash: function () {
        if(this.state.isOpen) {
            var tetherOptions = {
                attachment: 'top right',
                targetAttachment: 'bottom right',
                targetOffset: '14px 0'
            };

            return (
                <Popover
                    tetherOptions={tetherOptions}
                    className="PopoverBody PopoverBody--withArrow AddToDashboard"
                >
                    <AddToDashboardPopover
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                        broadcastEventFn={this.props.broadcastEventFn}
                        closePopoverFn={this.toggle}
                    />
                </Popover>
            );
        }
    },
    render: function () {
        // TODO: if our card is dirty should we disable this button?
        //       ex: someone modifies a query but hasn't run/save the change?
        return (
            <span>
                <a className="mx1 text-grey-4 text-brand-hover" href="#" title="Add this to a dashboard" onClick={this.toggle}>
                    <Icon name='addtodash' width="16px" height="16px"/>
                </a>
                {this.addToDash()}
            </span>
        );
    }
});
