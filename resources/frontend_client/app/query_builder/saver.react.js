'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var Saver = React.createClass({
    displayName: 'Saver',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        hasChanged: React.PropTypes.bool,
        saveFn: React.PropTypes.func.isRequired
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
    toggleModal: function () {
        var modalOpen = !this.state.modalOpen;
        this.setState({
            modalOpen: modalOpen
        }, function () {
            // focus the name field
            this.refs.name.getDOMNode().focus();
        });
    },
    isFormReady: function () {
        // TODO: make this work properly
        return true;
    },
    save: function (event) {
        event.preventDefault();

        var name = this.refs.name.getDOMNode().value.trim();
        var description = this.refs.description.getDOMNode().value.trim();
        var public_perms = this.refs.public_perms.getDOMNode().value;

        this.props.saveFn({
            name: name,
            description: description,
            public_perms: public_perms
        });

        this.setState({
            modalOpen: false
        });
    },
    renderCardSaveForm: function() {
        // TODO: hard coding values :(
        var privacyOptions = [
            (<option key="0" value="0">Private</option>),
            (<option key="1" value="1">Others can read</option>),
            (<option key="2" value="2">Others can modify</option>)
        ];

        var formError;
        if (this.state.errors) {
            var errorMessage = "Server error encountered";
            if (this.state.errors.data &&
                this.state.errors.data.message) {
                errorMessage = this.state.errors.data.message;
            }

            // TODO: timeout display?
            formError = (
                <span className="text-error px2">{errorMessage}</span>
            );
        }

        var buttonClasses = cx({
            "Button": true,
            "Button--primary": this.isFormReady()
        });

        return (
            <form className="Form-new" onSubmit={this.save}>
                <FormField
                    displayName="Name"
                    fieldName="name"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="name" className="Form-input Form-offset full" name="name" placeholder="What is the name of your card?" autofocus/>
                </FormField>

                <FormField
                    displayName="Description (optional)"
                    fieldName="description"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="description" className="Form-input Form-offset full" name="description" placeholder="What else should people know about this?" />
                </FormField>

                <FormField
                    displayName="Privacy"
                    fieldName="public_perms"
                    showCharm={false}
                    errors={this.state.errors}>
                    <label className="Select Form-offset">
                        <select ref="public_perms">
                            {privacyOptions}
                        </select>
                    </label>
                </FormField>

                <div className="Form-actions">
                    <button className={buttonClasses}>
                        Save
                    </button>
                    {formError}
                </div>
            </form>
        );
    },
    render: function() {
        if (!this.props.card.isDirty()) {
            return false;
        }

        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen
        });

        return (
            <div className="SaveWrapper">
                <div className={modalClasses}>
                    <div className="ModalContent">
                        {this.renderCardSaveForm()}
                    </div>
                </div>
                <a className="Button Button--primary" onClick={this.toggleModal}>Save</a>
            </div>
        );
    }
});
