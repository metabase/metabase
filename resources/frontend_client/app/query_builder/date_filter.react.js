var DateFilter = React.createClass({
    displayName: 'DateFilter',
    propTypes: {
        date: React.PropTypes.string.isRequired,
        onChange: React.PropTypes.func.isRequired
    },
    render: function () {
        var date;

        if(this.props.date) {
            date = moment(this.props.date);
        } else {
            date = moment();
        }

        return (
            <DatePicker
                dateFormat="YYYY-MM-DD"
                selected={date}
                onChange={this.props.onChange}
            />
        );
    }
});
