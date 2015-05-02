'use strict';
/*global moment, DatePicker*/

var DateFilter = React.createClass({
    displayName: 'DateFilter',
    propTypes: {
        date: React.PropTypes.string.isRequired,
        onChange: React.PropTypes.func.isRequired
    },

    onChange: function(date) {
        if (this.props.index) {
            this.props.onChange(this.props.index, date);
        } else {
            this.props.onChange(date);
        }
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
                onChange={this.onChange}
            />
        );
    }
});
