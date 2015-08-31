'use strict';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'FormField',
    propTypes: {
        fieldName: React.PropTypes.string.isRequired,
        displayName: React.PropTypes.string.isRequired,
        showCharm: React.PropTypes.bool,
        errors: React.PropTypes.object
    },
    extractFieldError: function() {
        if (this.props.errors &&
            this.props.errors.data.errors &&
            this.props.fieldName in this.props.errors.data.errors) {
            return this.props.errors.data.errors[this.props.fieldName];
        } else {
            return null;
        }
    },
    render: function() {
        var fieldError = this.extractFieldError();

        var fieldClasses = cx({
            "Form-field": true,
            "Form--fieldError": (fieldError !== null)
        });

        var fieldErrorMessage;
        if (fieldError !== null) {
            fieldErrorMessage = (
                <span className="text-error mx1">{fieldError}</span>
            );
        }

        var fieldLabel = (
            <label className="Form-label">{this.props.displayName} {fieldErrorMessage}</label>
        );

        var formCharm;
        if (this.props.showCharm) {
            formCharm = (
                <span className="Form-charm"></span>
            );
        }

        return (
            <div className={fieldClasses}>
                {fieldLabel}
                {this.props.children}
                {formCharm}
            </div>
        );
    }
});
