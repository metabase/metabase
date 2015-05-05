'use strict';
/*global DateFilter, SelectionModule, CloseIcon*/

var SortWidget = React.createClass({
    displayName: 'SortWidget',
    propTypes: {
        sort: React.PropTypes.array.isRequired,
        fieldList: React.PropTypes.array.isRequired,
        index: React.PropTypes.number.isRequired,
        updateSort: React.PropTypes.func.isRequired,
        removeSort: React.PropTypes.func.isRequired
    },
    sectionClassName: 'Filter-section',

    componentWillMount: function() {
        this.componentWillReceiveProps(this.props);
    },

    componentWillReceiveProps: function(newProps) {
        var field = newProps.sort[0],           // id of the field
            direction = newProps.sort[1];       // sort direction

        this.setState({
            field: field,
            direction: direction
        });
    },

    setField: function(value, index, sortListIndex) {
        if (this.state.field !== value) {
            this.props.updateSort(this.props.index, [value, this.state.direction]);
        }
    },

    setDirection: function(value, index, sortListIndex) {
        if (this.state.direction !== value) {
            this.props.updateSort(this.props.index, [this.state.field, value]);
        }
    },

    render: function() {
        var directionOptions = [
            {key: "ascending", val: "ascending"},
            {key: "descending", val: "descending"},
        ];

        return (
            <div className="Query-filter">
                <div className={this.sectionClassName}>
                    <SelectionModule
                        action={this.setField}
                        display='name'
                        index={0}
                        items={this.props.fieldList}
                        placeholder="Sort by ..."
                        selectedValue={this.state.field}
                        selectedKey='id'
                        isInitiallyOpen={this.state.field === null}
                        parentIndex={this.props.index}
                    />
                </div>

                <div className={this.sectionClassName}>
                    <SelectionModule
                        placeholder="..."
                        items={directionOptions}
                        display="key"
                        selectedValue={this.state.direction}
                        selectedKey="val"
                        index={1}
                        isInitiallyOpen={false}
                        parentIndex={this.props.index}
                        action={this.setDirection}
                    />
                </div>

                <a onClick={this.props.removeSort.bind(null, this.props.index)}>
                    <CloseIcon width="12px" height="12px" />
                </a>
            </div>
        );
    }
});
