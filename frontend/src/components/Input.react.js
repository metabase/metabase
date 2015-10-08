export default React.createClass({
    displayName: "Input",
    propTypes: {
        type: React.PropTypes.string,
        value: React.PropTypes.string,
        placeholder: React.PropTypes.string,
        onChange: React.PropTypes.func,
        onBlurChange: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            type: "text"
        };
    },

    getInitialState: function() {
        return { value: this.props.value };
    },

    componentWillReceiveProps: function(newProps) {
        this.setState({ value: newProps.value });
    },

    onChange: function(event) {
        this.setState({ value:  event.target.value });
        if (this.props.onChange) {
            this.props.onChange(event);
        }
    },

    onBlur: function(event) {
        if (this.props.onBlurChange && (this.props.value || "") !== event.target.value) {
            this.props.onBlurChange(event);
        }
    },

    render: function() {
        return <input {...this.props} value={this.state.value} onBlur={this.onBlur} onChange={this.onChange} />
    }
});
