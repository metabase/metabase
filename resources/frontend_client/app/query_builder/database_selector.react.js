var DatabaseSelector = React.createClass({
    render: function () {
        return (
            <SelectionModule
                placeholder="What database would you like to work with?"
                items={this.props.dbList}
                action={this.props.setDatabase}
                isInitiallyOpen={false}
                selectedValue={this.props.db}
                selectedKey='id'
                display='name'
            />
        );
    }
});
