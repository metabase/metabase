'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var AddToDashboard = React.createClass({
    displayName: 'AddToDashboard',
    propTypes: {
        // description: React.PropTypes.string,
        // hasChanged: React.PropTypes.bool,
        // name: React.PropTypes.string,
        // permissions: React.PropTypes.number,
        // setPermissions: React.PropTypes.func.isRequired,
        // save: React.PropTypes.func.isRequired
    },
    mixins: [OnClickOutside],
    getInitialState: function () {
        return {
            modalOpen: false,
            triggerAction: this._openModal
        };
    },
    handleClickOutside: function () {
        this.replaceState(this.getInitialState());
    },
    _openModal: function () {
        this.setState({
            modalOpen: true,
            triggerAction: this._save
        }, function () {
            // focus the name field
            this.refs.name.getDOMNode().focus();
        });
    },
    // _save: function () {
    //     var name = this.refs.name.getDOMNode().value,
    //         description = this.refs.description.getDOMNode().value;

    //     this.props.save({
    //         name: name,
    //         description: description
    //     });
    //     // reset the modal
    //     this.setState({
    //         modalOpen: false,
    //         triggerAction: this._openModal
    //     });
    // },
    render: function () {
        return (
            <button className="Button Button--primary">Add to Dash</button>
        );
    }
});
