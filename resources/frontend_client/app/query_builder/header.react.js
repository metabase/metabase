var QueryHeader = React.createClass({
    render: function () {
        var name = this.props.name || "What would you like to know?";
        return (
            <h1 className="QueryName">{name}</h1>
        )
    }
});
