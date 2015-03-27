'use strict';

var PureRenderMixin = React.addons.PureRenderMixin;

var QueryHeader = React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        name: React.PropTypes.string
    },
    mixins: [PureRenderMixin],
    render: function () {
        var name = this.props.name || "What would you like to know?";
        return (
            <div className="QueryHeader">
                <div className="QueryWrapper">
                    <div className="inline-block">
                        <h1 className="QueryName">{name}</h1>
                    </div>
                    {this.props.children}
                </div>
            </div>
        )
    }
});
