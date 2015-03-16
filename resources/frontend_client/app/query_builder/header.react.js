var PureRenderMixin = React.addons.PureRenderMixin;

var QueryHeader = React.createClass({
    displayName: 'QueryHeader',
    mixins: [PureRenderMixin],
    propTypes: {
        name: React.PropTypes.string
    },
    render: function () {
        var name = this.props.name || "What would you like to know?";
        return (
            <h1 className="QueryName">{name}</h1>
        )
    }
});
