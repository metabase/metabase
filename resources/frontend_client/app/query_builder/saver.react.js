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
    isFormReady: function () {
        // TODO: make this work properly
        return true;
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
        if (!this.props.card.isDirty()) {
            return false;
        }

        var buttonClasses = cx({
            'SaveButton': true,
            'Button': true,
            'block': true,
            'Button--primary': this.isFormReady()
        });
        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen
        });

        // TODO: these should be html <option> elements
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

// <form className="Form-new bordered rounded shadowed">
//                             <div className="Form-field" mb-form-field="name">
//                                 <mb-form-label display-name="Name" field-name="name"></mb-form-label>
//                                 <input ref="name" className="Form-input Form-offset full" name="name" placeholder="What is the name of your dashboard?" defaultValue={this.props.card.name} autofocus/>
//                                 <span className="Form-charm"></span>
//                             </div>

//                             <div className="Form-field" mb-form-field="description">
//                                 <mb-form-label display-name="Description" field-name="description"></mb-form-label>
//                                 <input ref="description" className="Form-input Form-offset full" name="description" placeholder="What else should people know about this?" defaultValue={this.props.card.description} />
//                                 <span className="Form-charm"></span>
//                             </div>

//                             <div className="Form-field" mb-form-field="public_perms">
//                                 <mb-form-label display-name="Privacy" field-name="public_perms"></mb-form-label>
//                                 <label className="Select Form-offset">
//                                     <select ref="public_perms">
//                                         {privacyOptions}
//                                     </select>
//                                 </label>
//                             </div>

//                             <div className="Form-actions">
//                                 <button className={buttonClasses} onClick={this.save} ng-disabled="!form.$valid">
//                                     Save
//                                 </button>
//                                 <mb-form-message form="form"></mb-form-message>
//                             </div>
//                         </form>

        return (
            <div className="SaveWrapper">
                <div className={modalClasses}>
                    <div className="ModalContent">

                    </div>
                </div>
                <a className="Button Button--primary" onClick={this.state.triggerAction}>Save</a>
            </div>
        );
    }
});
