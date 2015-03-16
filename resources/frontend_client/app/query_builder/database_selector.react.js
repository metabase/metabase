var DatabaseSelector = React.createClass({
    displayName: 'DatabaseSelector',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        setDatabase: React.PropTypes.func.isRequired,
        currentDatabaseId: React.PropTypes.number.isRequired
    },
    render: function () {
        return (
            <SelectionModule
                placeholder="What database would you like to work with?"
                items={this.props.databases}
                action={this.props.setDatabase}
                isInitiallyOpen={false}
                selectedValue={this.props.currentDatabaseId}
                selectedKey='id'
                display='name'
            />
        );
    }
});
