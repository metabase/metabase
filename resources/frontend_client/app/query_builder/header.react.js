'use strict';

var PureRenderMixin = React.addons.PureRenderMixin;

// Title - saved card title, otherwise static default
// Edit - only shown after Save
// Save - only shown after Run
// Download Data - only shown after Run
// Add to Dashboard - only shown after Save
// GUI vs SQL mode toggle - 2 mode slider

var QueryHeader = React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        save: React.PropTypes.func.isRequired,
        downloadLink: React.PropTypes.string

        // :: Add To Dashboard

        // :: Query Mode Toggle
        // allow native queries (available types list?)
        // setType() function
    },
    mixins: [PureRenderMixin],
    render: function () {
        var title = this.props.card.name || "What would you like to know?",
            editButton,
            downloadButton,
            buttonGroup;

        // NOTE: we expect our component provider provided something falsey if now download available
        if (this.props.downloadLink) {
            downloadButton = (
                <a className="Button inline-block mr1" href={this.props.downloadLink} target="_blank">Download data</a>
            );
        }

        // we consider a card to be already saved if it has an id
        if (this.props.card.id !== undefined) {
            editButton = (
                <button className="Button float-right">Edit</button>
            );
        }

        return (
            <div class="clearfix">
                <h1 className="QueryName">{title}</h1>
                {editButton}
                <Saver
                    card={this.props.card}
                    hasChanged={false}
                    save={this.props.save.bind(this.props.model)}
                />
                {downloadButton}
                <AddToDashboard />
                <QueryModeToggle />
            </div>
        );
    }
});
