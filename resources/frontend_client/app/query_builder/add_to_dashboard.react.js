'use strict';
/*global cx, OnClickOutside, SelectionModule*/

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
    render: function () {
        // if we don't have a saved card then don't render anything
        if (this.props.card.id === undefined) {
            return false;
        }

        // we are rendering a button & controlling a modal popover associated with the button

        var modal;
        if (this.state.modalOpen) {
            var tetherOptions = {
                attachment: 'top left',
                targetAttachment: 'bottom left',
                targetOffset: '20px -150px',
                optimizations: {
                    moveElement: false // always moves to <body> anyway!
                }
            };

            modal = (
                <Popover
                    className="bg-white bordered rounded"
                    tetherOptions={tetherOptions}
                    closePopoverFn={this.toggleModal}>
                    <AddToDashboardPopover
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                    />
                </Popover>
            );
        }


        // TODO: if our card is dirty should we disable this button?
        //       ex: someone modifies a query but hasn't run/save the change?

        return (
            <span>
                {modal}
                <button className="Button Button--primary" onClick={this.toggleModal}>Add to Dash</button>
            </span>
        );
    }
});
