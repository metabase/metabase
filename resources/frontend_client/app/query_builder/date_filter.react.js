'use strict';

/*global window,moment*/

// import compiled version, webpack doesn't seem to be running JSX transforms on node_modules
// css imported in init.css
import DatePicker from 'react-datepicker/react-datepicker';

// DatePicker depedencies :(
window.Tether = require('tether/tether');
window.moment = require('moment');

export default React.createClass({
    displayName: 'DateFilter',
    propTypes: {
        date: React.PropTypes.string,
        index: React.PropTypes.number,
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
