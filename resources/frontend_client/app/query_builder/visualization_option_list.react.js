'use strict';

/*
    this component is used to render a list of visualization options and
    trigger the specified callback when one is clicked
    
    this component only knows how to render a list of options, it should not be used for 
    determining which options to render
*/

var VisualizationOptionList = React.createClass({
    displayName: 'VisualizationOptionList',
    propTypes: {
        action: React.PropTypes.func.isRequired,
        current: React.PropTypes.string
    },
    _types: function () {
        return [
            'table',
            'line',
            'bar',
            'pie',
            'area',
            'timeseries'
        ];
    },
    render: function () {
        var options = this._types().map(function (type) {
            var buttonClasses = cx({
                'Button': true,
                'Button--primary': (type === this.props.current)
            });
            return (
                <li className="inline-block">
                    <a className={buttonClasses} href="#" onClick={this.props.action.bind(null, type)}>
                        {type}
                    </a>
                </li>
            );
        }.bind(this));

        return (
            <ul className="VisualizationOptionList">
                {options}
            </ul>
        );

    }
});
