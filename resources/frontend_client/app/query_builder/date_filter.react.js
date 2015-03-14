var DateFilter = React.createClass({
    displayName: 'DateFilter',
    render: function () {
        // our date will either be provided or we'll need to set up a new one
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
