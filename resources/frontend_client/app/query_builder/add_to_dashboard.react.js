'use strict';
/*global cx, OnClickOutside, Popover, AddToDashboardPopover, SelectionModule, AddToDashIcon, ReactCSSTransitionGroup*/

var AddToDashboard = React.createClass({
    displayName: 'AddToDashboard',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired
    },
    getInitialState: function () {
        return {
            modalOpen: false
        };
    },
    toggleModal: function () {
        var modalOpen = !this.state.modalOpen;
        this.setState({
            modalOpen: modalOpen
        });
    },
    addToDash: function () {
        if(this.state.modalOpen) {
            var tetherOptions = {
                attachment: 'top right',
                targetAttachment: 'bottom right',
                targetOffset: '14px 0'
            };

            return (
                <Popover
                    tetherOptions={tetherOptions}
                    className="PopoverBody PopoverBody--withArrow"
                >
                    <AddToDashboardPopover
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                        closePopoverFn={this.toggleModal}
                    />
                </Popover>
            );
        }
    },
    render: function () {
        // if we don't have a saved card then don't render anything
        // TODO: we should probably do this in the header
        if (this.props.card.id === undefined) {
            return false;
        }

        // TODO: if our card is dirty should we disable this button?
        //       ex: someone modifies a query but hasn't run/save the change?
        return (
            <span>
                <a className="mx1" href="#" title="Add this data to a dashboard" onClick={this.toggleModal}>
                    <AddToDashIcon />
                </a>
                <ReactCSSTransitionGroup transitionName="Transition-popover">
                    {this.addToDash()}
                </ReactCSSTransitionGroup>
            </span>
        );
    }
});
