'use strict';
/*global DateFilter, SelectionModule*/

var FilterWidget = React.createClass({
    displayName: 'FilterWidget',
    propTypes: {
        field: React.PropTypes.number, // the id of the field
        filterFieldList: React.PropTypes.array.isRequired,
        index: React.PropTypes.number.isRequired,
        operator: React.PropTypes.string,
        operatorList: React.PropTypes.array.isRequired,
        updateFilter: React.PropTypes.func.isRequired, // a function to update the
        valueFields: React.PropTypes.object
    },
    sectionClassName: 'Filter-section',
    _updateTextFilterValue: function (index) {
        var value = this.refs.textFilterValue.getDOMNode().value;
        // we always know the index will 2 for the value of a filter
        this.props.updateFilter(value, 2, index);
    },
    _isOpen: function (value) {
        if (value !== undefined) {
            return true;
        } else {
            return false;
        }
    },
    _operatorList: function () {
        return (
            <div className={this.sectionClassName}>
                <SelectionModule
                    placeholder="..."
                    items={this.props.operatorList}
                    display='verbose_name'
                    selectedValue={this.props.operator}
                    selectedKey='name'
                    index={0}
                    isInitiallyOpen={this._isOpen()}
                    parentIndex={this.props.index}
                    action={this.props.updateFilter}
                />
            </div>
        );
    },
    _fieldList: function () {
        return (
            <div className={this.sectionClassName}>
                <SelectionModule
                    action={this.props.updateFilter}
                    display='name'
                    index={1}
                    items={this.props.filterFieldList}
                    placeholder="Filter by..."
                    selectedValue={this.props.field}
                    selectedKey='id'
                    isInitiallyOpen={this._isOpen()}
                    parentIndex={this.props.index}
                />
            </div>
        );
    },
    _getSafeValues: function () {
        return this.props.valueFields.values.map(function(value) {
            var safeValues = {};
            for(var key in value) {
                // TODO: why typing issues can we run into here?
                //       we used to call toString() on these values
                safeValues[key] = value[key];
            }
            return safeValues;
        });
    },
    _filterValue: function () {
        var valueHtml,
            isOpen = true;

        if(this.props.valueFields) {

            if(this.props.valueFields.values) {
                // do some fixing up of the values so we can display true / false without causing "return true" or "return false"
                var values = this._getSafeValues();

                if(this.props.value) {
                    isOpen = false;
                }

                valueHtml = (
                    <SelectionModule
                        action={this.props.updateFilter}
                        display='name'
                        index='2'
                        items={values}
                        isInitiallyOpen={isOpen}
                        placeholder="..."
                        selectedValue={this.props.value}
                        selectedKey='key'
                        parentIndex={this.props.index}
                    />
                );
            } else {
                switch(this.props.valueFields.type) {
                    case 'date':
                        valueHtml = (
                            <DateFilter
                                date={this.props.value}
                                onChange={
                                    function (date) {
                                        this.props.updateFilter(
                                            date.format('YYYY-MM-DD'),
                                            2,
                                            this.props.index
                                        );
                                    }.bind(this)
                                }
                            />
                        );
                        break;
                    default:
                        valueHtml = (
                            <input
                                className="input"
                                type="text"
                                defaultValue={this.props.value}
                                onChange={this._updateTextFilterValue.bind(null, this.props.index)}
                                ref="textFilterValue"
                                placeholder="What value?"
                            />
                        );
                }
            }
        }
        return (
            <div className="FilterSection">
                {valueHtml}
            </div>
        );
    },
    render: function () {
        var closeStyle = {
                fill: '#ddd'
            };

        return (
            <div className="Query-filter rounded">
                {this._fieldList()}
                {this._operatorList()}
                {this._filterValue()}
                <a className="RemoveTrigger" href="#" onClick={this.props.remove.bind(null, this.props.index)}>
                    <svg className="geomicon" data-icon="close" viewBox="0 0 32 32" style={closeStyle} width="16px" height="16px">
                        <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                    </svg>
                </a>
            </div>
        );
    }
});
