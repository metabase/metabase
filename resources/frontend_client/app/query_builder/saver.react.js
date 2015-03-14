var Saver = React.createClass({
    mixins: [OnClickOutside],
    getInitialState: function () {
        return {
            modalOpen: false,
            triggerAction: this._openModal
        };
    },
    handleClickOutside: function () {
        this.replaceState(this.getInitialState())
    },
    _openModal: function () {
        this.setState({
            modalOpen: true,
            triggerAction: this._save
        }, function () {
            // focus the name field
            this.refs.name.getDOMNode().focus()
        })
    },
    _save: function () {
        var name = this.refs.name.getDOMNode().value,
            description = this.refs.description.getDOMNode().value

        this.props.save({
            name: name,
            description: description
        })
        // reset the modal
        this.setState({
            modalOpen: false,
            triggerAction: this._openModal
        })
    },
    render: function () {
        var buttonClasses = cx({
            'SaveButton': true,
            'ActionButton': true,
            'block': true,
            'ActionButton--primary': this.state.modalOpen
        })
        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen
        })

        var buttonText;

        // if the query has changed or the modal has been opened
        if(this.props.hasChanged == true || this.state.modalOpen == true) {
            buttonText = "Save"
        } else {
            buttonText = "Edit"
        }

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

        return (
            <div className="SaveWrapper float-right mr2">
                <div className={modalClasses}>
                    <div className="ModalContent">
                        <input ref="name" type="text" placeholder="Name" autofocus defaultValue={this.props.name} />
                        <input ref="description" type="text" placeholder="Add a description" defaultValue={this.props.description}/>
                        <div className="mt4 ml2 mr2 clearfix">
                            <span className="text-grey-3 inline-block my1">Privacy:</span>
                            <div className="float-right">
                                <SelectionModule
                                    placeholder="Privacy"
                                    items={privacyOptions}
                                    selectedKey='code'
                                    selectedValue={this.props.permissions}
                                    display='display'
                                    action={this.props.setPermissions}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <a className={buttonClasses} onClick={this.state.triggerAction}>
                    {buttonText}
                </a>
            </div>
        )
    }
});
