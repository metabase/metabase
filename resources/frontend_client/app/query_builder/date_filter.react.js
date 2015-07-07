'use strict';

/*global window*/

// import compiled version, webpack doesn't seem to be running JSX transforms on node_modules
// css imported in init.css
import DatePicker from 'react-datepicker';
import Tether from 'tether';
import moment from 'moment';

// DatePicker depedencies :(
window.Tether = Tether;
window.moment = moment;

export default React.createClass({
    displayName: 'DateFilter',
    propTypes: {
        date: React.PropTypes.string,
        index: React.PropTypes.number,
        onChange: React.PropTypes.func.isRequired
    },

    onChange: function(date) {
        console.log('onchange date', moment(date))
        if (this.props.index) {
            this.props.onChange(this.props.index, moment(date).format('YYYY-MM-DD'));
        } else {
            this.props.onChange(moment(date).format('YYYY-MM-DD'));
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
