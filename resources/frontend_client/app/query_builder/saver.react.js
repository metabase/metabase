'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var Saver = React.createClass({
    displayName: 'Saver',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        hasChanged: React.PropTypes.bool,
        save: React.PropTypes.func.isRequired
    },
    mixins: [OnClickOutside],
    getInitialState: function () {
        return {
            modalOpen: false,
            triggerAction: this._openModal,
            permissions: this.props.card.public_perms
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
    _setPermissions: function(permission) {
        console.log('setting perm to ', permission);
        this.setState({
            permissions: permission
        });
    },
    _save: function () {
        var name = this.refs.name.getDOMNode().value,
            description = this.refs.description.getDOMNode().value,
            permissions = this.state.permissions;

        this.props.save({
            name: name,
            description: description,
            permissions: permissions
        });
        // reset the modal
        this.setState({
            modalOpen: false,
            triggerAction: this._openModal
        });
    },
    render: function () {
        var buttonClasses = cx({
            'SaveButton': true,
            'Button': true,
            'block': true,
            'Button--primary': this.state.modalOpen
        });
        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen
        });

        var privacyOptions = [
            {
                code: 0,
                display: 'Private'
            },
            {
                code: 1,
                display: 'Others can read'
            },
            {
                code: 2,
                display: 'Others can modify'
            },
        ];

        // default state is false, which means we don't render anything in the DOM
        var saver = false;
        if (this.props.card.isDirty()) {
            saver = (
                <div className="SaveWrapper mr2">
                    <div className={modalClasses}>
                        <div className="ModalContent">
                            <input ref="name" type="text" placeholder="Name" autofocus defaultValue={this.props.card.name} />
                            <input ref="description" type="text" placeholder="Add a description" defaultValue={this.props.card.description}/>
                            <div className="mt4 ml2 mr2 clearfix">
                                <span className="text-grey-3 inline-block my1">Privacy:</span>
                                <div className="float-right">
                                    <SelectionModule
                                        placeholder="Privacy"
                                        items={privacyOptions}
                                        selectedKey='code'
                                        selectedValue={this.props.permissions}
                                        display='display'
                                        action={this._setPermissions}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <a className={buttonClasses} onClick={this.state.triggerAction}>Save</a>
                </div>
            );
        }

        return saver;
    }
});
